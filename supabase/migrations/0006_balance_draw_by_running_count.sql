-- Fix: the "rest" of a draw batch was split by index parity (odd/even),
-- which is only even when the starting counts for both teams are equal.
-- With exactly one pinned player, the initial counts are 1 vs 0, and index
-- parity keeps that one-player skew for the whole batch (reproduced live:
-- 7x5 instead of 6x6 on a 12-player batch with 1 pin). Fix: assign each
-- remaining player, in random order, to whichever team currently has fewer
-- — self-corrects regardless of how many of the two slots were pinned.
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
    update players set team_id = v_team_a.id, pin_slot = null where id = v_pinned_first;
    v_count_a := 1;
  end if;
  if v_pinned_second is not null then
    update players set team_id = v_team_b.id, pin_slot = null where id = v_pinned_second;
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
