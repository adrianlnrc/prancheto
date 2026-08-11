-- Code review finding: move_player only rejected a 'playing' team as
-- source/target, but #18/#20 introduced 'done' for teams dissolved by case
-- 1/2. Moving a player into (or out of) a dissolved team is meaningless —
-- reject both statuses the same way.
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
  if v_target_status in ('playing', 'done') then
    raise exception 'cannot move a player into a team that is % ', v_target_status;
  end if;

  if v_source_team_id is not null then
    select status into v_source_status from teams where id = v_source_team_id;
    if v_source_status in ('playing', 'done') then
      raise exception 'cannot move a player out of a team that is %', v_source_status;
    end if;
  end if;

  select team_size into v_team_size from rounds where id = v_round_id;
  select count(*) into v_target_count from players where team_id = p_target_team_id;

  if v_target_count < v_team_size then
    update players set team_id = p_target_team_id, consecutive_matches = 0 where id = p_player_id;
    perform sync_team_fullness(p_target_team_id);
  else
    if p_swap_out_player_id is null then
      raise exception 'target team % is full — a swap_out player is required', p_target_team_id;
    end if;

    if not exists (
      select 1 from players where id = p_swap_out_player_id and team_id = p_target_team_id
    ) then
      raise exception 'swap_out player % is not on team %', p_swap_out_player_id, p_target_team_id;
    end if;

    update players set team_id = p_target_team_id, consecutive_matches = 0 where id = p_player_id;
    update players set team_id = v_source_team_id, consecutive_matches = 0 where id = p_swap_out_player_id;
  end if;
end;
$$;
