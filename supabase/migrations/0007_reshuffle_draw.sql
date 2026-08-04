-- Stop clearing pin_slot when a draw assigns a pinned player to a team.
-- Once a player has a team_id, pin_slot is inert for future draws (those
-- only look at team_id is null players) — but keeping it lets reshuffle_draw
-- know who was anchored, since teams don't carry that marker themselves.
create or replace function confirm_draw(p_round_id uuid)
returns table (team_a_id uuid, team_b_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_team_size int;
  v_waiting_count int;
  v_next_label_ord int;
  v_label_a text;
  v_label_b text;
  v_team_a teams;
  v_team_b teams;
  v_pinned_first uuid;
  v_pinned_second uuid;
  v_rest uuid[];
  v_count_a int := 0;
  v_count_b int := 0;
  v_home_id uuid;
  v_away_id uuid;
  v_next_queue_pos int;
  i int;
begin
  select team_size, current_home_team_id, current_away_team_id
    into v_team_size, v_home_id, v_away_id
    from rounds where id = p_round_id;

  select count(*) into v_waiting_count
    from players where round_id = p_round_id and team_id is null;

  if v_waiting_count < v_team_size * 2 then
    raise exception 'not enough waiting players for a draw: % of %', v_waiting_count, v_team_size * 2;
  end if;

  select count(*) into v_next_label_ord from teams where round_id = p_round_id;
  v_label_a := chr(65 + v_next_label_ord);
  v_label_b := chr(65 + v_next_label_ord + 1);

  insert into teams (round_id, label, status, formed_at)
    values (p_round_id, v_label_a, 'forming', now()) returning * into v_team_a;
  insert into teams (round_id, label, status, formed_at)
    values (p_round_id, v_label_b, 'forming', now()) returning * into v_team_b;

  select id into v_pinned_first from players
    where round_id = p_round_id and team_id is null and pin_slot = 'first' limit 1;
  select id into v_pinned_second from players
    where round_id = p_round_id and team_id is null and pin_slot = 'second' limit 1;

  if v_pinned_first is not null then
    update players set team_id = v_team_a.id where id = v_pinned_first;
    v_count_a := 1;
  end if;
  if v_pinned_second is not null then
    update players set team_id = v_team_b.id where id = v_pinned_second;
    v_count_b := 1;
  end if;

  select array_agg(id order by random()) into v_rest
    from players
    where round_id = p_round_id and team_id is null
      and id not in (coalesce(v_pinned_first, '00000000-0000-0000-0000-000000000000'),
                     coalesce(v_pinned_second, '00000000-0000-0000-0000-000000000000'));

  for i in 1 .. coalesce(array_length(v_rest, 1), 0) loop
    if v_count_a <= v_count_b then
      update players set team_id = v_team_a.id where id = v_rest[i];
      v_count_a := v_count_a + 1;
    else
      update players set team_id = v_team_b.id where id = v_rest[i];
      v_count_b := v_count_b + 1;
    end if;
  end loop;

  if v_home_id is null then
    update teams set status = 'playing' where id in (v_team_a.id, v_team_b.id);
    update rounds set current_home_team_id = v_team_a.id, current_away_team_id = v_team_b.id
      where id = p_round_id;
  else
    select coalesce(max(queue_position), 0) into v_next_queue_pos
      from teams where round_id = p_round_id and status = 'queued';
    update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_team_a.id;
    update teams set status = 'queued', queue_position = v_next_queue_pos + 2 where id = v_team_b.id;
  end if;

  return query select v_team_a.id, v_team_b.id;
end;
$$;

-- Re-shuffle the players already on the two given teams (must belong to
-- p_round_id and must not already have a recorded match — see the second
-- guard below), without creating new team rows. Players still carrying a
-- pin_slot (set during the original confirm_draw and left in place there)
-- stay anchored to the team matching their slot; everyone else is
-- reshuffled between the two teams using the same greedy balancing as
-- confirm_draw, so the split stays team_size/team_size regardless of how
-- many players are anchored.
create or replace function reshuffle_draw(p_round_id uuid, p_team_a_id uuid, p_team_b_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_count_a int := 0;
  v_count_b int := 0;
  v_rest uuid[];
  i int;
begin
  if not exists (
    select 1 from teams
    where round_id = p_round_id and id in (p_team_a_id, p_team_b_id)
    having count(*) = 2
  ) then
    raise exception 'team_a % and team_b % must both belong to round %', p_team_a_id, p_team_b_id, p_round_id;
  end if;

  -- Refuse to rewrite history: a team that already played a match must not
  -- be reshuffled, since that would silently change who actually played it.
  if exists (
    select 1 from matches
    where round_id = p_round_id
      and (home_team_id in (p_team_a_id, p_team_b_id) or away_team_id in (p_team_a_id, p_team_b_id))
  ) then
    raise exception 'team_a % or team_b % already has a recorded match — cannot reshuffle', p_team_a_id, p_team_b_id;
  end if;

  select count(*) into v_count_a from players
    where team_id = p_team_a_id and pin_slot = 'first';
  select count(*) into v_count_b from players
    where team_id = p_team_b_id and pin_slot = 'second';

  select array_agg(id order by random()) into v_rest
    from players
    where team_id in (p_team_a_id, p_team_b_id)
      and not (team_id = p_team_a_id and pin_slot = 'first')
      and not (team_id = p_team_b_id and pin_slot = 'second');

  for i in 1 .. coalesce(array_length(v_rest, 1), 0) loop
    if v_count_a <= v_count_b then
      update players set team_id = p_team_a_id where id = v_rest[i];
      v_count_a := v_count_a + 1;
    else
      update players set team_id = p_team_b_id where id = v_rest[i];
      v_count_b := v_count_b + 1;
    end if;
  end loop;
end;
$$;
