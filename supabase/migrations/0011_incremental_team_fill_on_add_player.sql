-- Ticket #16: once the round's initial draw has happened (#14), arrivals
-- stop waiting for another draw. Each new player is auto-allocated into the
-- oldest 'forming' team that still has room; if none has room, a new
-- 'forming' team is created for them. Before the initial draw (no teams
-- exist yet for the round), players stay unassigned, waiting for confirm_draw.
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
  end if;

  return v_player;
end;
$$;
