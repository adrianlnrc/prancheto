-- Found live-testing in production: the post-match "Sai / Entra" summary
-- screen pre-computed its message client-side from the queue snapshot
-- *before* calling record_match_result, assuming the old "whole team swap"
-- model. That's wrong for case 1 (the loser doesn't fully leave the roster
-- that forms the new team) and flatly false for case 2 (the loser never
-- leaves the court at all — only 1-2 players are swapped). The client has
-- no way to know which branch fired without asking, so record_match_result
-- now reports back what it actually did.
create or replace function record_match_result(p_round_id uuid, p_winner text)
returns table (
  outcome text,
  winner_label text,
  loser_label text,
  entering_label text,
  subs_in text[],
  subs_out text[]
)
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
  v_out_ids uuid[];
  v_next_label_ord int;
  v_label text;
  v_new_team_id uuid;
  v_outcome text;
  v_winner_label text;
  v_loser_label text;
  v_entering_label text;
  v_subs_in text[] := '{}';
  v_subs_out text[] := '{}';
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

  select label into v_winner_label from teams where id = v_winner_id;
  select label into v_loser_label from teams where id = v_loser_id;

  update players set consecutive_matches = consecutive_matches + 1 where team_id = v_winner_id;

  select id into v_next_team_id from teams
    where round_id = p_round_id and status = 'queued'
    order by queue_position asc limit 1;

  if v_next_team_id is null then
    update players set consecutive_matches = consecutive_matches + 1 where team_id = v_loser_id;
    return query select 'no_change'::text, v_winner_label, v_loser_label, null::text, v_subs_in, v_subs_out;
    return;
  end if;

  select count(*) into v_next_count from players where team_id = v_next_team_id;

  if v_next_count = 0 then
    update teams set status = 'done', queue_position = null where id = v_next_team_id;
    update players set consecutive_matches = consecutive_matches + 1 where team_id = v_loser_id;
    return query select 'no_change'::text, v_winner_label, v_loser_label, null::text, v_subs_in, v_subs_out;
    return;
  end if;

  if v_next_count >= 3 and v_next_count < v_team_size then
    v_outcome := 'case1';
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

    select label into v_entering_label from teams where id = v_next_team_id;
  elsif v_next_count < 3 then
    v_outcome := 'case2';

    update players set consecutive_matches = consecutive_matches + 1 where team_id = v_loser_id;

    select array_agg(id) into v_out_ids from (
      select id from players
        where team_id = v_loser_id
        order by consecutive_matches desc, arrival_order asc
        limit v_next_count
    ) s;

    select coalesce(array_agg(name), '{}') into v_subs_in from players where team_id = v_next_team_id;
    select coalesce(array_agg(name), '{}') into v_subs_out from players where id = any(v_out_ids);

    update players set team_id = null, consecutive_matches = 0 where id = any(v_out_ids);
    update players set team_id = v_loser_id, consecutive_matches = 0 where team_id = v_next_team_id;

    update teams set status = 'done', queue_position = null where id = v_next_team_id;
    -- Loser keeps playing — its team status and the round's current
    -- home/away pointers are intentionally left unchanged.
    return query select v_outcome, v_winner_label, v_loser_label, null::text, v_subs_in, v_subs_out;
    return;
  else
    v_outcome := 'full_swap';

    update players set consecutive_matches = consecutive_matches + 1 where team_id = v_loser_id;

    select coalesce(max(queue_position), 0) into v_next_queue_pos
      from teams where round_id = p_round_id and status = 'queued';
    update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_loser_id;

    select label into v_entering_label from teams where id = v_next_team_id;
  end if;

  update teams set status = 'playing', queue_position = null where id = v_next_team_id;

  if p_winner = 'home' then
    update rounds set current_away_team_id = v_next_team_id where id = p_round_id;
  else
    update rounds set current_home_team_id = v_next_team_id where id = p_round_id;
  end if;

  return query select v_outcome, v_winner_label, v_loser_label, v_entering_label, v_subs_in, v_subs_out;
end;
$$;
