-- Ticket #15: "tirar da lista" gets the same on-the-spot replacement
-- mark_injured already has — including when the removed player is currently
-- on a team that's playing right now. Previously this was a bare delete
-- with no replacement at all.
create or replace function remove_player(p_player_id uuid)
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

  delete from players where id = p_player_id;

  if v_team_id is not null then
    select id into v_replacement_id from players
      where round_id = v_round_id and team_id is null and is_injured = false
      order by arrival_order asc limit 1;

    if v_replacement_id is not null then
      update players set team_id = v_team_id where id = v_replacement_id;
    end if;
  end if;
end;
$$;
