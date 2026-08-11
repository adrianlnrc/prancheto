-- Ticket #24: there was no way to create an empty team on demand — teams
-- only ever appeared automatically inside add_player (no forming team had
-- room) or record_match_result's case 1 (loser's leftovers). This RPC is
-- the prerequisite for "arrastar pra criar time novo" (#26): drag a waiting
-- player onto a fresh drop zone and have a real team exist for them to land in.
create or replace function create_team(p_round_id uuid)
returns teams
language plpgsql
set search_path = public
as $$
declare
  v_team teams;
  v_next_label_ord int;
  v_label text;
begin
  perform 1 from rounds where id = p_round_id for update;

  select count(*) into v_next_label_ord from teams where round_id = p_round_id;
  v_label := chr(65 + v_next_label_ord);

  insert into teams (round_id, label, status)
    values (p_round_id, v_label, 'forming')
    returning * into v_team;

  return v_team;
end;
$$;
