-- Ticket #19: tracks how many matches in a row a player has played on their
-- current team, without leaving it. Feeds case 2's fatigue-based
-- substitution (#20): whoever has the highest streak on the losing team is
-- first to sit when only 1-2 subs are available.
alter table players add column consecutive_matches int not null default 0;

-- mark_injured: the player who leaves resets; whoever replaces them starts
-- fresh on the team they're joining.
create or replace function mark_injured(p_player_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_round_id uuid;
  v_team_id uuid;
  v_replacement_id uuid;
begin
  select round_id, team_id into v_round_id, v_team_id from players where id = p_player_id;

  update players set is_injured = true, team_id = null, consecutive_matches = 0 where id = p_player_id;

  if v_team_id is not null then
    select id into v_replacement_id from players
      where round_id = v_round_id and team_id is null and is_injured = false and id != p_player_id
      order by arrival_order asc limit 1;

    if v_replacement_id is not null then
      update players set team_id = v_team_id, consecutive_matches = 0 where id = v_replacement_id;
    end if;
  end if;
end;
$$;

-- remove_player: same idea (the removed row is deleted, so only the
-- replacement's counter needs resetting).
create or replace function remove_player(p_player_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_round_id uuid;
  v_team_id uuid;
  v_replacement_id uuid;
begin
  select round_id, team_id into v_round_id, v_team_id from players where id = p_player_id;

  delete from players where id = p_player_id;

  if v_team_id is not null then
    select id into v_replacement_id from players
      where round_id = v_round_id and team_id is null and is_injured = false
      order by arrival_order asc limit 1;

    if v_replacement_id is not null then
      update players set team_id = v_team_id, consecutive_matches = 0 where id = v_replacement_id;
    end if;
  end if;
end;
$$;

-- move_player: whoever changes teams (mover, and swap_out if any) resets.
create or replace function move_player(
  p_player_id uuid,
  p_target_team_id uuid,
  p_swap_out_player_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_round_id uuid;
  v_source_team_id uuid;
  v_source_status text;
  v_target_round_id uuid;
  v_target_status text;
  v_team_size int;
  v_target_count int;
begin
  select round_id, team_id into v_round_id, v_source_team_id from players where id = p_player_id;
  if v_round_id is null then
    raise exception 'player % not found', p_player_id;
  end if;

  perform 1 from rounds where id = v_round_id for update;

  select round_id, status into v_target_round_id, v_target_status from teams where id = p_target_team_id;
  if v_target_round_id is null then
    raise exception 'team % not found', p_target_team_id;
  end if;
  if v_target_round_id != v_round_id then
    raise exception 'team % does not belong to the same round as player %', p_target_team_id, p_player_id;
  end if;
  if v_target_status = 'playing' then
    raise exception 'cannot move a player into a team that is playing';
  end if;

  if v_source_team_id is not null then
    select status into v_source_status from teams where id = v_source_team_id;
    if v_source_status = 'playing' then
      raise exception 'cannot move a player out of a team that is playing';
    end if;
  end if;

  select team_size into v_team_size from rounds where id = v_round_id;
  select count(*) into v_target_count from players where team_id = p_target_team_id;

  if v_target_count < v_team_size then
    update players set team_id = p_target_team_id, consecutive_matches = 0 where id = p_player_id;
    perform sync_team_fullness(p_target_team_id);
  else
    if p_swap_out_player_id is null then
      raise exception 'target team % is full — a swap_out player is required', p_target_team_id;
    end if;

    if not exists (
      select 1 from players where id = p_swap_out_player_id and team_id = p_target_team_id
    ) then
      raise exception 'swap_out player % is not on team %', p_swap_out_player_id, p_target_team_id;
    end if;

    update players set team_id = p_target_team_id, consecutive_matches = 0 where id = p_player_id;
    update players set team_id = v_source_team_id, consecutive_matches = 0 where id = p_swap_out_player_id;
  end if;
end;
$$;

-- record_match_result: winner's roster always gets +1. Loser's roster gets
-- +1 too when the team stays intact (queue empty, already-complete next
-- team, or the <3 interim case) — they played this match together and
-- carry on as a team. When case 1 dissolves the loser (topped off into the
-- next team, leftover forming a new one), everyone on it resets to 0 —
-- they're all leaving that team identity, whichever side they land on.
create or replace function record_match_result(p_round_id uuid, p_winner text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_home_id uuid;
  v_away_id uuid;
  v_team_size int;
  v_winner_id uuid;
  v_loser_id uuid;
  v_next_team_id uuid;
  v_next_count int;
  v_next_queue_pos int;
  v_needed int;
  v_fill_ids uuid[];
  v_next_label_ord int;
  v_label text;
  v_new_team_id uuid;
begin
  if p_winner not in ('home', 'away') then
    raise exception 'invalid winner: % (must be home or away)', p_winner;
  end if;

  perform 1 from rounds where id = p_round_id for update;

  select current_home_team_id, current_away_team_id, team_size
    into v_home_id, v_away_id, v_team_size
    from rounds where id = p_round_id;

  if v_home_id is null or v_away_id is null then
    raise exception 'round % has no active match to resolve', p_round_id;
  end if;

  insert into matches (round_id, home_team_id, away_team_id, winner)
    values (p_round_id, v_home_id, v_away_id, p_winner);

  v_winner_id := case when p_winner = 'home' then v_home_id else v_away_id end;
  v_loser_id := case when p_winner = 'home' then v_away_id else v_home_id end;

  update players set consecutive_matches = consecutive_matches + 1 where team_id = v_winner_id;

  select id into v_next_team_id from teams
    where round_id = p_round_id and status = 'queued'
    order by queue_position asc limit 1;

  if v_next_team_id is null then
    update players set consecutive_matches = consecutive_matches + 1 where team_id = v_loser_id;
    return;
  end if;

  select count(*) into v_next_count from players where team_id = v_next_team_id;

  if v_next_count < v_team_size and v_next_count >= 3 then
    update players set consecutive_matches = 0 where team_id = v_loser_id;

    v_needed := v_team_size - v_next_count;

    select array_agg(id) into v_fill_ids from (
      select id from players
        where team_id = v_loser_id
        order by arrival_order asc
        limit v_needed
    ) s;

    update players set team_id = v_next_team_id where id = any(v_fill_ids);

    select count(*) into v_next_label_ord from teams where round_id = p_round_id;
    v_label := chr(65 + v_next_label_ord);
    insert into teams (round_id, label, status, formed_at)
      values (p_round_id, v_label, 'forming', now())
      returning id into v_new_team_id;

    update players set team_id = v_new_team_id
      where team_id = v_loser_id and not (id = any(v_fill_ids));

    update teams set status = 'done', queue_position = null where id = v_loser_id;
  else
    update players set consecutive_matches = consecutive_matches + 1 where team_id = v_loser_id;

    select coalesce(max(queue_position), 0) into v_next_queue_pos
      from teams where round_id = p_round_id and status = 'queued';
    update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_loser_id;
  end if;

  update teams set status = 'playing', queue_position = null where id = v_next_team_id;

  if p_winner = 'home' then
    update rounds set current_away_team_id = v_next_team_id where id = p_round_id;
  else
    update rounds set current_home_team_id = v_next_team_id where id = p_round_id;
  end if;
end;
$$;
