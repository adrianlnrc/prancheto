-- Reforma da lógica de time: joga fora a distinção por limiar (case1 vs
-- case2 vs full_swap) que causava o bug relatado (o time perdedor às vezes
-- não recebia a reposição esperada quando o time da fila estava incompleto).
-- Um jogador nunca mais fica "sem time": o time perdedor sempre dilui de
-- volta pra fila geral (mantendo a ordem relativa entre si), e o
-- preenchimento anda pra frente pelos times da fila (o próximo primeiro,
-- depois o de trás, etc) puxando quem tiver disponível. O time da frente
-- sempre assume a quadra, mesmo incompleto, se não sobrar gente suficiente.
--
-- "Machucado" deixa de existir como conceito — a ação manual vira "saiu"
-- (player_leave), com o mesmo efeito de sempre: libera o jogador pro final
-- da fila geral e puxa o primeiro da fila pro lugar dele. consecutive_matches
-- também sai: só existia pra decidir quem saía primeiro no case2, que não
-- existe mais.

create or replace function record_match_result(p_round_id uuid, p_winner text)
returns table (
  outcome text,
  winner_label text,
  loser_label text,
  entering_label text,
  subs_in text[],
  subs_out text[]
)
language plpgsql
set search_path = public
as $$
declare
  v_home_id uuid;
  v_away_id uuid;
  v_team_size int;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_label text;
  v_loser_label text;
  v_next_team_id uuid;
  v_entering_label text;
  v_subs_in text[] := '{}';
  v_subs_out text[] := '{}';
  v_max_order int;
  v_team_row record;
  v_room int;
  v_fill_ids uuid[];
  v_fill_names text[];
begin
  if p_winner not in ('home', 'away') then
    raise exception 'invalid winner: % (must be home or away)', p_winner;
  end if;

  perform 1 from rounds where id = p_round_id for update;

  select current_home_team_id, current_away_team_id, team_size
    into v_home_id, v_away_id, v_team_size
    from rounds where id = p_round_id;

  if v_home_id is null or v_away_id is null then
    raise exception 'round % has no active match to resolve', p_round_id;
  end if;

  insert into matches (round_id, home_team_id, away_team_id, winner)
    values (p_round_id, v_home_id, v_away_id, p_winner);

  v_winner_id := case when p_winner = 'home' then v_home_id else v_away_id end;
  v_loser_id := case when p_winner = 'home' then v_away_id else v_home_id end;

  select label into v_winner_label from teams where id = v_winner_id;
  select label into v_loser_label from teams where id = v_loser_id;
  select coalesce(array_agg(name), '{}') into v_subs_out from players where team_id = v_loser_id;

  -- Quem é o próximo: a frente da fila de times (queued por posição, depois
  -- forming por ordem de criação) — entra mesmo que incompleto.
  select id into v_next_team_id from teams
    where round_id = p_round_id and status in ('queued', 'forming')
    order by (queue_position is null) asc, queue_position asc, created_at asc
    limit 1;

  if v_next_team_id is null then
    -- Ninguém esperando: os 2 times atuais continuam.
    return query select 'no_change'::text, v_winner_label, v_loser_label, null::text,
      '{}'::text[], '{}'::text[];
    return;
  end if;

  -- Dilui o time perdedor: cada jogador volta pro final da fila geral,
  -- mantendo a ordem relativa entre eles (primeiro do time reentra primeiro).
  select coalesce(max(arrival_order), 0) into v_max_order from players where round_id = p_round_id;

  with releasing as (
    select id, row_number() over (order by arrival_order asc) as rn
    from players where team_id = v_loser_id
  )
  update players p
    set team_id = null, arrival_order = v_max_order + releasing.rn
    from releasing
    where p.id = releasing.id;

  update teams set status = 'done', queue_position = null where id = v_loser_id;

  -- Preenchimento em cascata: começa no time da frente; se já tem vaga
  -- nenhuma, segue pro próximo da fila, e assim por diante.
  for v_team_row in
    select t.id, t.queue_position, t.created_at,
      (select count(*) from players where team_id = t.id) as roster_count
    from teams t
    where t.round_id = p_round_id and t.status in ('queued', 'forming')
    order by (t.queue_position is null) asc, t.queue_position asc, t.created_at asc
  loop
    v_room := v_team_size - v_team_row.roster_count;

    if v_room > 0 then
      select coalesce(array_agg(id), '{}') into v_fill_ids from (
        select id from players
          where round_id = p_round_id and team_id is null
          order by arrival_order asc
          limit v_room
      ) s;

      if array_length(v_fill_ids, 1) > 0 then
        select coalesce(array_agg(name), '{}') into v_fill_names from players where id = any(v_fill_ids);
        if v_team_row.id = v_next_team_id then
          v_subs_in := v_fill_names;
        end if;
        update players set team_id = v_team_row.id where id = any(v_fill_ids);
        perform sync_team_fullness(v_team_row.id);
      end if;
    end if;

    exit when not exists (
      select 1 from players where round_id = p_round_id and team_id is null
    );
  end loop;

  select label into v_entering_label from teams where id = v_next_team_id;

  update teams set status = 'playing', queue_position = null where id = v_next_team_id;

  if p_winner = 'home' then
    update rounds set current_away_team_id = v_next_team_id where id = p_round_id;
  else
    update rounds set current_home_team_id = v_next_team_id where id = p_round_id;
  end if;

  return query select 'rotated'::text, v_winner_label, v_loser_label, v_entering_label,
    v_subs_in, v_subs_out;
end;
$$;

-- "Saiu" (era mark_injured): libera o jogador pro final da fila geral,
-- puxa o primeiro da fila pro lugar dele — em quadra ou no banco, tanto faz.
drop function if exists mark_injured(uuid);

create or replace function player_leave(p_player_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_round_id uuid;
  v_team_id uuid;
  v_max_order int;
  v_replacement_id uuid;
begin
  select round_id, team_id into v_round_id, v_team_id from players where id = p_player_id;
  if v_round_id is null then
    raise exception 'player % not found', p_player_id;
  end if;

  select coalesce(max(arrival_order), 0) into v_max_order from players where round_id = v_round_id;

  update players set team_id = null, arrival_order = v_max_order + 1 where id = p_player_id;

  if v_team_id is not null then
    select id into v_replacement_id from players
      where round_id = v_round_id and team_id is null and id != p_player_id
      order by arrival_order asc limit 1;

    if v_replacement_id is not null then
      update players set team_id = v_team_id where id = v_replacement_id;
      perform sync_team_fullness(v_team_id);
    end if;
  end if;
end;
$$;

-- move_player: um jogador pode entrar num time em quadra agora (via troca
-- direta, igual já funciona pra times cheios) — só times 'done' continuam
-- proibidos como destino. Sair de um time em quadra sem troca continua
-- bloqueado (a única porta de entrada num time em quadra é uma troca).
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
  if v_target_status = 'done' then
    raise exception 'cannot move a player into a team that is done';
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
    update players set team_id = p_target_team_id where id = p_player_id;
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

    update players set team_id = p_target_team_id where id = p_player_id;
    update players set team_id = v_source_team_id where id = p_swap_out_player_id;
  end if;
end;
$$;

-- remove_player: repõe do jeito de sempre, só sem o filtro de is_injured
-- (coluna não existe mais).
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
      where round_id = v_round_id and team_id is null
      order by arrival_order asc limit 1;

    if v_replacement_id is not null then
      update players set team_id = v_team_id where id = v_replacement_id;
      perform sync_team_fullness(v_team_id);
    end if;
  end if;
end;
$$;

alter table players drop column if exists is_injured;
alter table players drop column if exists consecutive_matches;
