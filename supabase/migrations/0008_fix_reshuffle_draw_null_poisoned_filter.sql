-- Bug found in live testing: "sortear de novo" never actually changed
-- anything. The WHERE clause excluded pinned players using
-- `not (team_id = X and pin_slot = 'first')` — but for any unpinned player
-- (pin_slot is null), `pin_slot = 'first'` evaluates to NULL, so
-- `TRUE and NULL` is NULL, and `not NULL` is NULL — which a WHERE clause
-- treats as "exclude". Every unpinned player on the matching team got
-- silently dropped from the reshuffle pool, leaving it empty (or just the
-- unpinned players from the OTHER team, who fail the opposite condition
-- the same way), so the loop never ran. Fixed by resolving the two anchor
-- player ids up front (same pattern confirm_draw already uses) and
-- excluding them by id, which has no NULL-in-a-boolean-AND pitfall.
create or replace function reshuffle_draw(p_round_id uuid, p_team_a_id uuid, p_team_b_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_pinned_first uuid;
  v_pinned_second uuid;
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

  if exists (
    select 1 from matches
    where round_id = p_round_id
      and (home_team_id in (p_team_a_id, p_team_b_id) or away_team_id in (p_team_a_id, p_team_b_id))
  ) then
    raise exception 'team_a % or team_b % already has a recorded match — cannot reshuffle', p_team_a_id, p_team_b_id;
  end if;

  select id into v_pinned_first from players
    where team_id = p_team_a_id and pin_slot = 'first' limit 1;
  select id into v_pinned_second from players
    where team_id = p_team_b_id and pin_slot = 'second' limit 1;

  if v_pinned_first is not null then v_count_a := 1; end if;
  if v_pinned_second is not null then v_count_b := 1; end if;

  select array_agg(id order by random()) into v_rest
    from players
    where team_id in (p_team_a_id, p_team_b_id)
      and id not in (coalesce(v_pinned_first, '00000000-0000-0000-0000-000000000000'),
                     coalesce(v_pinned_second, '00000000-0000-0000-0000-000000000000'));

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
