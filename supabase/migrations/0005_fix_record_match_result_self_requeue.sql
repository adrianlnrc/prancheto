-- Bug found in live testing against a real project: when the queue was
-- empty, the losing (or both, on a draw) team(s) got queued *before*
-- picking "the next team", so the team that just left immediately got
-- picked as its own replacement — teams never actually left the court.
-- Fix: pick the next challenger(s) from the queue BEFORE benching the
-- current team(s), so the natural status = 'queued' filter can't include
-- a team that just started playing this same call.
create or replace function record_match_result(p_round_id uuid, p_winner text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_home_id uuid;
  v_away_id uuid;
  v_next_queue_pos int;
  v_next_team_id uuid;
  v_next_team_id_2 uuid;
begin
  select current_home_team_id, current_away_team_id into v_home_id, v_away_id
    from rounds where id = p_round_id;

  if v_home_id is null or v_away_id is null then
    raise exception 'round % has no active match to resolve', p_round_id;
  end if;

  insert into matches (round_id, home_team_id, away_team_id, winner)
    values (p_round_id, v_home_id, v_away_id, p_winner);

  select coalesce(max(queue_position), 0) into v_next_queue_pos
    from teams where round_id = p_round_id and status = 'queued';

  if p_winner = 'draw' then
    select id into v_next_team_id from teams
      where round_id = p_round_id and status = 'queued'
      order by queue_position asc limit 1;
    select id into v_next_team_id_2 from teams
      where round_id = p_round_id and status = 'queued'
        and id != coalesce(v_next_team_id, '00000000-0000-0000-0000-000000000000')
      order by queue_position asc limit 1;

    update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_home_id;
    update teams set status = 'queued', queue_position = v_next_queue_pos + 2 where id = v_away_id;

    update teams set status = 'playing', queue_position = null where id = v_next_team_id;
    update teams set status = 'playing', queue_position = null where id = v_next_team_id_2;

    update rounds set current_home_team_id = v_next_team_id, current_away_team_id = v_next_team_id_2
      where id = p_round_id;
  else
    select id into v_next_team_id from teams
      where round_id = p_round_id and status = 'queued'
      order by queue_position asc limit 1;

    if p_winner = 'home' then
      update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_away_id;
    else
      update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_home_id;
    end if;

    update teams set status = 'playing', queue_position = null where id = v_next_team_id;

    if p_winner = 'home' then
      update rounds set current_away_team_id = v_next_team_id where id = p_round_id;
    else
      update rounds set current_home_team_id = v_next_team_id where id = p_round_id;
    end if;
  end if;
end;
$$;
