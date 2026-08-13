-- Ticket (sessão de revisão de arquitetura, 2026-08-12): unifica a regra de
-- alocação de jogador livre num único lugar. Até aqui, add_player,
-- player_leave, remove_player e o cascade de record_match_result cada um
-- reimplementava sua própria versão de "pega o próximo da fila geral e
-- encaixa" — com pequenas divergências entre elas. A partir de agora existe
-- uma função só, assign_free_players, chamada depois de qualquer evento que
-- solte um jogador (chegada, saída, remoção, dissolução do time perdedor).
--
-- Prioridade de preenchimento (confirmada com o usuário):
--   1) times fora de campo (forming/queued), o mais antigo primeiro
--   2) só se nenhum time de fora tiver vaga, completa um time em campo
--   3) se mesmo assim sobrar gente, abre um time novo
--
-- Isso também fecha a lacuna identificada na revisão: um time sem nenhum
-- jogador não pode mais ser promovido a 'playing' (record_match_result agora
-- confere o roster real depois do preenchimento antes de assumir a quadra).
--
-- confirm_draw também muda aqui: o sorteio inicial deixa de exigir
-- team_size*2 esperando — dá pra sortear com apenas 2 (ou mais) jogadores,
-- a qualquer momento antes do primeiro sorteio da rodada.

create or replace function assign_free_players(p_round_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_team_size int;
  v_team_row record;
  v_room int;
  v_fill_ids uuid[];
  v_next_label_ord int;
  v_label text;
  v_new_team_id uuid;
begin
  select team_size into v_team_size from rounds where id = p_round_id;

  -- Passo 1: times fora de campo (forming/queued), mais antigo primeiro
  -- (queue_position se já estiver na fila, senão created_at).
  for v_team_row in
    select t.id
    from teams t
    where t.round_id = p_round_id and t.status in ('forming', 'queued')
    order by (t.queue_position is null) asc, t.queue_position asc, t.created_at asc
  loop
    v_room := v_team_size - (select count(*) from players where team_id = v_team_row.id);
    if v_room > 0 then
      select coalesce(array_agg(id), '{}') into v_fill_ids from (
        select id from players
          where round_id = p_round_id and team_id is null
          order by arrival_order asc
          limit v_room
      ) s;
      if array_length(v_fill_ids, 1) > 0 then
        update players set team_id = v_team_row.id where id = any(v_fill_ids);
        perform sync_team_fullness(v_team_row.id);
      end if;
    end if;
    exit when not exists (
      select 1 from players where round_id = p_round_id and team_id is null
    );
  end loop;

  -- Passo 2: só se ainda sobrar gente livre, completa times em campo.
  if exists (select 1 from players where round_id = p_round_id and team_id is null) then
    for v_team_row in
      select t.id
      from teams t
      where t.round_id = p_round_id and t.status = 'playing'
      order by t.created_at asc
    loop
      v_room := v_team_size - (select count(*) from players where team_id = v_team_row.id);
      if v_room > 0 then
        select coalesce(array_agg(id), '{}') into v_fill_ids from (
          select id from players
            where round_id = p_round_id and team_id is null
            order by arrival_order asc
            limit v_room
        ) s;
        if array_length(v_fill_ids, 1) > 0 then
          update players set team_id = v_team_row.id where id = any(v_fill_ids);
        end if;
      end if;
      exit when not exists (
        select 1 from players where round_id = p_round_id and team_id is null
      );
    end loop;
  end if;

  -- Passo 3: ainda sobrou gente e não tem vaga em nenhum time existente —
  -- abre time(s) novo(s) até esvaziar o restante.
  while exists (select 1 from players where round_id = p_round_id and team_id is null) loop
    select count(*) into v_next_label_ord from teams where round_id = p_round_id;
    v_label := chr(65 + v_next_label_ord);

    insert into teams (round_id, label, status, formed_at)
      values (p_round_id, v_label, 'forming', now())
      returning id into v_new_team_id;

    select coalesce(array_agg(id), '{}') into v_fill_ids from (
      select id from players
        where round_id = p_round_id and team_id is null
        order by arrival_order asc
        limit v_team_size
    ) s;

    update players set team_id = v_new_team_id where id = any(v_fill_ids);
    perform sync_team_fullness(v_new_team_id);
  end loop;
end;
$$;

-- add_player: insere na fila; se a rodada já teve o sorteio inicial (existe
-- pelo menos um time), delega o encaixe pra assign_free_players.
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

  if exists (select 1 from teams where round_id = p_round_id) then
    perform assign_free_players(p_round_id);
    select * into v_player from players where id = v_player.id;
  end if;

  return v_player;
end;
$$;

-- player_leave ("saiu"): solta o jogador pro fim da fila geral e deixa
-- assign_free_players decidir quem recebe a vaga livre — não
-- necessariamente o próprio time de quem saiu (prioridade é fora de campo).
create or replace function player_leave(p_player_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_round_id uuid;
  v_max_order int;
begin
  select round_id into v_round_id from players where id = p_player_id;
  if v_round_id is null then
    raise exception 'player % not found', p_player_id;
  end if;

  perform 1 from rounds where id = v_round_id for update;

  select coalesce(max(arrival_order), 0) into v_max_order from players where round_id = v_round_id;

  update players set team_id = null, arrival_order = v_max_order + 1 where id = p_player_id;

  perform assign_free_players(v_round_id);
end;
$$;

-- remove_player: apaga e deixa assign_free_players redistribuir quem tiver
-- vaga aberta em qualquer time — igual player_leave.
create or replace function remove_player(p_player_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_round_id uuid;
begin
  select round_id into v_round_id from players where id = p_player_id;

  delete from players where id = p_player_id;

  if v_round_id is not null then
    perform assign_free_players(v_round_id);
  end if;
end;
$$;

-- record_match_result: dissolve o time perdedor de volta pra fila geral
-- (preservando ordem entre eles) só quando existe um próximo time pra
-- assumir; delega o preenchimento pra assign_free_players; e só promove o
-- time entrante a 'playing' se ele realmente tiver gente depois do
-- preenchimento (fecha a lacuna do time vazio entrando em quadra).
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
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_label text;
  v_loser_label text;
  v_next_team_id uuid;
  v_entering_label text;
  v_subs_in text[] := '{}';
  v_subs_out text[] := '{}';
  v_before_ids uuid[];
  v_max_order int;
  v_entering_count int;
begin
  if p_winner not in ('home', 'away') then
    raise exception 'invalid winner: % (must be home or away)', p_winner;
  end if;

  perform 1 from rounds where id = p_round_id for update;

  select current_home_team_id, current_away_team_id
    into v_home_id, v_away_id
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

  -- Próximo candidato: o mais antigo fora de campo — entra mesmo incompleto
  -- (será completado pelo time que acabou de perder, seguindo ordem de
  -- chegada, exatamente como funciona uma pelada real).
  select id into v_next_team_id from teams
    where round_id = p_round_id and status in ('queued', 'forming')
    order by (queue_position is null) asc, queue_position asc, created_at asc
    limit 1;

  if v_next_team_id is null then
    -- Ninguém esperando: os 2 times atuais continuam — não dissolve o
    -- perdedor, ele segue em quadra do jeito que está.
    return query select 'no_change'::text, v_winner_label, v_loser_label, null::text,
      '{}'::text[], '{}'::text[];
    return;
  end if;

  select coalesce(array_agg(name), '{}') into v_subs_out from players where team_id = v_loser_id;
  select coalesce(array_agg(id), '{}') into v_before_ids from players where team_id = v_next_team_id;

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

  perform assign_free_players(p_round_id);

  select count(*) into v_entering_count from players where team_id = v_next_team_id;

  if v_entering_count = 0 then
    -- Não deveria acontecer em operação normal (o time que saiu sempre
    -- libera gente), mas evita promover um time vazio pra quadra.
    return query select 'no_change'::text, v_winner_label, v_loser_label, null::text,
      '{}'::text[], v_subs_out;
    return;
  end if;

  select coalesce(array_agg(name), '{}') into v_subs_in
    from players where team_id = v_next_team_id and not (id = any(v_before_ids));

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

-- confirm_draw: sortear a qualquer momento com 2+ jogadores esperando, em
-- vez de exigir team_size*2. Continua sendo o único sorteio da rodada
-- (segue recusando um segundo sorteio) e continua dividindo TODO mundo que
-- estiver esperando no momento, não só os 2 primeiros.
create or replace function confirm_draw(p_round_id uuid)
returns table (team_a_id uuid, team_b_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_home_id uuid;
  v_away_id uuid;
  v_waiting_count int;
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
  select current_home_team_id, current_away_team_id
    into v_home_id, v_away_id
    from rounds where id = p_round_id;

  if v_home_id is not null or v_away_id is not null then
    raise exception 'round % already had its initial draw', p_round_id;
  end if;

  select count(*) into v_waiting_count
    from players where round_id = p_round_id and team_id is null;

  if v_waiting_count < 2 then
    raise exception 'not enough waiting players for a draw: % of 2', v_waiting_count;
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
