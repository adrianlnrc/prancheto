-- Ticket #20: the last piece of the substitution rule. When the next team
-- in the queue has only 1 or 2 players (or is an empty husk), no whole team
-- rotates in — the loser keeps playing, swapping out its most fatigued
-- player(s) (highest consecutive_matches) for whoever's available. The
-- swapped-out players go back to the general waiting pool individually.
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
  v_out_ids uuid[];
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
    -- Nobody waiting: the same two teams keep playing.
    update players set consecutive_matches = consecutive_matches + 1 where team_id = v_loser_id;
    return;
  end if;

  select count(*) into v_next_count from players where team_id = v_next_team_id;

  if v_next_count = 0 then
    -- Empty husk (every member left without a replacement, edge case) —
    -- discard it so it doesn't block the queue forever; nobody available
    -- this time either.
    update teams set status = 'done', queue_position = null where id = v_next_team_id;
    update players set consecutive_matches = consecutive_matches + 1 where team_id = v_loser_id;
    return;
  end if;

  if v_next_count >= 3 and v_next_count < v_team_size then
    -- Case 1: dissolve the loser — top off the incoming team with its
    -- oldest arrivals, leftover forms a new team together.
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

    update teams set status = 'playing', queue_position = null where id = v_next_team_id;
    if p_winner = 'home' then
      update rounds set current_away_team_id = v_next_team_id where id = p_round_id;
    else
      update rounds set current_home_team_id = v_next_team_id where id = p_round_id;
    end if;

  elsif v_next_count < 3 then
    -- Case 2: 1 or 2 available — substitute that many fatigued players out
    -- of the loser (which keeps playing) instead of rotating a whole team.
    update players set consecutive_matches = consecutive_matches + 1 where team_id = v_loser_id;

    select array_agg(id) into v_out_ids from (
      select id from players
        where team_id = v_loser_id
        order by consecutive_matches desc, arrival_order asc
        limit v_next_count
    ) s;

    update players set team_id = null, consecutive_matches = 0 where id = any(v_out_ids);
    update players set team_id = v_loser_id, consecutive_matches = 0 where team_id = v_next_team_id;

    update teams set status = 'done', queue_position = null where id = v_next_team_id;
    -- Loser keeps playing — its team status and the round's current
    -- home/away pointers are intentionally left unchanged.

  else
    -- Already complete: bring it in as before, loser to the back of the queue.
    update players set consecutive_matches = consecutive_matches + 1 where team_id = v_loser_id;

    select coalesce(max(queue_position), 0) into v_next_queue_pos
      from teams where round_id = p_round_id and status = 'queued';
    update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_loser_id;

    update teams set status = 'playing', queue_position = null where id = v_next_team_id;
    if p_winner = 'home' then
      update rounds set current_away_team_id = v_next_team_id where id = p_round_id;
    else
      update rounds set current_home_team_id = v_next_team_id where id = p_round_id;
    end if;
  end if;
end;
$$;
