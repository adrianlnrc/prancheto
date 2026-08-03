-- mark_injured's replacement update had the wrong target column in an
-- earlier hotfix applied directly to the remote project; this migration
-- file documents that fix so a fresh `supabase db push` matches prod.
create or replace function mark_injured(p_player_id uuid)
returns void
language plpgsql
as $$
declare
  v_round_id uuid;
  v_team_id uuid;
  v_replacement_id uuid;
begin
  select round_id, team_id into v_round_id, v_team_id from players where id = p_player_id;

  update players set is_injured = true, team_id = null, pin_slot = null where id = p_player_id;

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
