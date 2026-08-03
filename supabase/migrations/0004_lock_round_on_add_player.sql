-- add_player's "select max(arrival_order)+1, then insert" was not safe
-- under concurrent calls for the same round (two people tapping "chegou"
-- at once could compute the same next arrival_order and collide, or,
-- observed in testing, simply commit out of submission order). Locking the
-- round row for the duration of the transaction serializes concurrent
-- calls for the same round without affecting other rounds/groups.
create or replace function add_player(p_round_id uuid, p_name text)
returns players
language plpgsql
set search_path = public
as $$
declare
  v_player players;
  v_next_order int;
begin
  perform 1 from rounds where id = p_round_id for update;

  select coalesce(max(arrival_order), 0) + 1 into v_next_order
    from players where round_id = p_round_id;

  insert into players (round_id, name, arrival_order)
    values (p_round_id, p_name, v_next_order)
    returning * into v_player;

  return v_player;
end;
$$;
