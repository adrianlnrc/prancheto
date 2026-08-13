-- Bug encontrado revisando a suíte de testes contra a 0021: assign_free_players
-- não conferia se a rodada já tinha passado pelo sorteio inicial antes de
-- mexer no pool de jogadores livres. add_player já tinha essa guarda (só
-- encaixa em time se `exists (select 1 from teams where round_id = ...)`),
-- mas player_leave e remove_player chamavam assign_free_players
-- incondicionalmente — então "tirar da lista" ou "saiu" ANTES do primeiro
-- sorteio disparava o passo 3 (abre time novo) em cima da fila crua
-- pré-sorteio inteira, formando times do nada antes de alguém clicar em
-- "sortear". Confirmado ao vivo com um cenário isolado (grupo de teste
-- descartável): 3 jogadores pré-sorteio, remove_player em 1 deles criava um
-- time com os 2 restantes.
--
-- Fix: assign_free_players agora não faz nada se a rodada ainda não tiver
-- nenhum time (i.e., o sorteio inicial ainda não rolou) — mesma guarda que
-- add_player já usa.

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
  if not exists (select 1 from teams where round_id = p_round_id) then
    -- Rodada ainda não teve o sorteio inicial — a fila crua fica intocada
    -- até confirm_draw rodar (mesma regra que add_player já seguia).
    return;
  end if;

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
