-- Ticket #18: remove empate from the product, and teach record_match_result
-- to bring an incomplete-but-viable (3+) next team into play, topped off by
-- the loser's oldest arrivals — the loser's leftovers form a new team.
--
-- This also finishes wiring the 'forming' -> 'queued' promotion that #16's
-- incremental formation needed but never got: before #14, a round's only
-- teams were the two formed by the (one-shot) initial draw, which go
-- straight to 'playing'. Nothing else ever produced a 'queued' team, so the
-- fila/queue was structurally empty. sync_team_fullness promotes a
-- 'forming' team to 'queued' the moment its roster reaches team_size —
-- called from add_player and move_player, the only two RPCs that can grow a
-- team. (Shrinking a queued team below team_size, e.g. via remove_player
-- with no replacement available, is left queued but understaffed — that's
-- exactly the "incomplete team in the queue" case this ticket handles.)

alter table matches drop constraint matches_winner_check;
alter table matches add constraint matches_winner_check check (winner in ('home', 'away'));

create or replace function sync_team_fullness(p_team_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_round_id uuid;
  v_status text;
  v_team_size int;
  v_count int;
  v_next_queue_pos int;
begin
  select round_id, status into v_round_id, v_status from teams where id = p_team_id;
  if v_status != 'forming' then
    return;
  end if;

  select team_size into v_team_size from rounds where id = v_round_id;
  select count(*) into v_count from players where team_id = p_team_id;

  if v_count >= v_team_size then
    select coalesce(max(queue_position), 0) + 1 into v_next_queue_pos
      from teams where round_id = v_round_id and status = 'queued';
    update teams set status = 'queued', queue_position = v_next_queue_pos where id = p_team_id;
  end if;
end;
$$;

create or replace function add_player(p_round_id uuid, p_name text)
returns players
language plpgsql
set search_path = public
as $$
declare
  v_player players;
  v_next_order int;
  v_team_size int;
  v_target_team_id uuid;
  v_next_label_ord int;
  v_label text;
begin
  select team_size into v_team_size from rounds where id = p_round_id for update;

  select coalesce(max(arrival_order), 0) + 1 into v_next_order
    from players where round_id = p_round_id;

  insert into players (round_id, name, arrival_order)
    values (p_round_id, p_name, v_next_order)
    returning * into v_player;

  if exists (select 1 from teams where round_id = p_round_id) then
    select t.id into v_target_team_id
      from teams t
      where t.round_id = p_round_id and t.status = 'forming'
        and (select count(*) from players where team_id = t.id) < v_team_size
      order by t.created_at asc
      limit 1;

    if v_target_team_id is null then
      select count(*) into v_next_label_ord from teams where round_id = p_round_id;
      v_label := chr(65 + v_next_label_ord);
      insert into teams (round_id, label, status, formed_at)
        values (p_round_id, v_label, 'forming', now())
        returning id into v_target_team_id;
    end if;

    update players set team_id = v_target_team_id where id = v_player.id;
    v_player.team_id := v_target_team_id;
    perform sync_team_fullness(v_target_team_id);
  end if;

  return v_player;
end;
$$;

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
    update players set team_id = p_target_team_id where id = p_player_id;
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

    update players set team_id = p_target_team_id where id = p_player_id;
    update players set team_id = v_source_team_id where id = p_swap_out_player_id;
  end if;
end;
$$;

-- Record a match result and rotate the queue (winner always stays).
-- Case 1 (this ticket): the next team in the queue has 3+ players but is
-- short of team_size — it plays anyway, topped off by the loser's oldest
-- arrivals; the loser's remaining players form a new team together.
-- Anything else (queue empty, next team already full, or next team has
-- fewer than 3) keeps today's behavior unchanged — the 0-2 case becomes
-- real substitution-by-fatigue in a later ticket (#20).
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

  select id into v_next_team_id from teams
    where round_id = p_round_id and status = 'queued'
    order by queue_position asc limit 1;

  if v_next_team_id is null then
    -- Nobody waiting: the same two teams keep playing. No change needed.
    return;
  end if;

  select count(*) into v_next_count from players where team_id = v_next_team_id;

  if v_next_count < v_team_size and v_next_count >= 3 then
    -- Case 1: complete the incoming team with the loser's oldest arrivals.
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
    -- Already complete, or too few for case 1 (see #20) — bring it in as-is.
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
