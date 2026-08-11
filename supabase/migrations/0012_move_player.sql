-- Ticket #17: manual team adjustment, now that fixar craque is gone (#14)
-- and formation is mostly incremental (#16). Only valid between teams that
-- aren't playing right now — moving into/out of an active match is reserved
-- for the forced-replacement paths (mark_injured, remove_player).
create or replace function move_player(
  p_player_id uuid,
  p_target_team_id uuid,
  p_swap_out_player_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_round_id uuid;
  v_source_team_id uuid;
  v_source_status text;
  v_target_round_id uuid;
  v_target_status text;
  v_team_size int;
  v_target_count int;
begin
  select round_id, team_id into v_round_id, v_source_team_id from players where id = p_player_id;
  if v_round_id is null then
    raise exception 'player % not found', p_player_id;
  end if;

  perform 1 from rounds where id = v_round_id for update;

  select round_id, status into v_target_round_id, v_target_status from teams where id = p_target_team_id;
  if v_target_round_id is null then
    raise exception 'team % not found', p_target_team_id;
  end if;
  if v_target_round_id != v_round_id then
    raise exception 'team % does not belong to the same round as player %', p_target_team_id, p_player_id;
  end if;
  if v_target_status = 'playing' then
    raise exception 'cannot move a player into a team that is playing';
  end if;

  if v_source_team_id is not null then
    select status into v_source_status from teams where id = v_source_team_id;
    if v_source_status = 'playing' then
      raise exception 'cannot move a player out of a team that is playing';
    end if;
  end if;

  select team_size into v_team_size from rounds where id = v_round_id;
  select count(*) into v_target_count from players where team_id = p_target_team_id;

  if v_target_count < v_team_size then
    update players set team_id = p_target_team_id where id = p_player_id;
  else
    if p_swap_out_player_id is null then
      raise exception 'target team % is full — a swap_out player is required', p_target_team_id;
    end if;

    if not exists (
      select 1 from players where id = p_swap_out_player_id and team_id = p_target_team_id
    ) then
      raise exception 'swap_out player % is not on team %', p_swap_out_player_id, p_target_team_id;
    end if;

    update players set team_id = p_target_team_id where id = p_player_id;
    -- Mutual swap. If the mover had no team (was waiting), there's no
    -- source team to send the swapped-out player to — they go back to the
    -- waiting pool instead.
    update players set team_id = v_source_team_id where id = p_swap_out_player_id;
  end if;
end;
$$;
