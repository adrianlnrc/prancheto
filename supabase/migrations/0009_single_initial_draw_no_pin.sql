-- Ticket #14: confirm_draw stops being a recurring "leva" draw and becomes a
-- single initial draw per round (formation afterwards is incremental, see
-- #16). Fixar craque (pin_slot) is removed from the product entirely —
-- separating players now happens via move_player (#17) after the draw.

-- confirm_draw: drop pin_slot logic, refuse a second draw, teams go
-- straight to 'playing' since there's never a home team yet when this runs.
create or replace function confirm_draw(p_round_id uuid)
returns table (team_a_id uuid, team_b_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_team_size int;
  v_waiting_count int;
  v_home_id uuid;
  v_away_id uuid;
  v_next_label_ord int;
  v_label_a text;
  v_label_b text;
  v_team_a teams;
  v_team_b teams;
  v_rest uuid[];
  v_count_a int := 0;
  v_count_b int := 0;
  i int;
begin
  select team_size, current_home_team_id, current_away_team_id
    into v_team_size, v_home_id, v_away_id
    from rounds where id = p_round_id;

  if v_home_id is not null or v_away_id is not null then
    raise exception 'round % already had its initial draw', p_round_id;
  end if;

  select count(*) into v_waiting_count
    from players where round_id = p_round_id and team_id is null;

  if v_waiting_count < v_team_size * 2 then
    raise exception 'not enough waiting players for a draw: % of %', v_waiting_count, v_team_size * 2;
  end if;

  select count(*) into v_next_label_ord from teams where round_id = p_round_id;
  v_label_a := chr(65 + v_next_label_ord);
  v_label_b := chr(65 + v_next_label_ord + 1);

  insert into teams (round_id, label, status, formed_at)
    values (p_round_id, v_label_a, 'playing', now()) returning * into v_team_a;
  insert into teams (round_id, label, status, formed_at)
    values (p_round_id, v_label_b, 'playing', now()) returning * into v_team_b;

  select array_agg(id order by random()) into v_rest
    from players
    where round_id = p_round_id and team_id is null;

  for i in 1 .. coalesce(array_length(v_rest, 1), 0) loop
    if v_count_a <= v_count_b then
      update players set team_id = v_team_a.id where id = v_rest[i];
      v_count_a := v_count_a + 1;
    else
      update players set team_id = v_team_b.id where id = v_rest[i];
      v_count_b := v_count_b + 1;
    end if;
  end loop;

  update rounds set current_home_team_id = v_team_a.id, current_away_team_id = v_team_b.id
    where id = p_round_id;

  return query select v_team_a.id, v_team_b.id;
end;
$$;

-- reshuffle_draw: no more pin anchors — reshuffles everyone on the two teams.
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

  if exists (
    select 1 from matches
    where round_id = p_round_id
      and (home_team_id in (p_team_a_id, p_team_b_id) or away_team_id in (p_team_a_id, p_team_b_id))
  ) then
    raise exception 'team_a % or team_b % already has a recorded match — cannot reshuffle', p_team_a_id, p_team_b_id;
  end if;

  select array_agg(id order by random()) into v_rest
    from players
    where team_id in (p_team_a_id, p_team_b_id);

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

-- mark_injured: stop touching pin_slot (column is dropped below).
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

  update players set is_injured = true, team_id = null where id = p_player_id;

  if v_team_id is not null then
    select id into v_replacement_id from players
      where round_id = v_round_id and team_id is null and is_injured = false and id != p_player_id
      order by arrival_order asc limit 1;

    if v_replacement_id is not null then
      update players set team_id = v_team_id where id = v_replacement_id;
    end if;
  end if;
end;
$$;

drop function if exists set_pin(uuid, text);
alter table players drop column if exists pin_slot;
