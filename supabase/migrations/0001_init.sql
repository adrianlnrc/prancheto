-- Prancheto v1 schema.
-- No-auth, link-based access: RLS policies below intentionally allow the
-- anon role to read/write everything. Anyone holding a group's slug can
-- fully manage that group's rounds — this mirrors the product decision
-- ("qualquer um com o link mexe em tudo") and trades off write-security
-- for simplicity, matching a casual pickup-game tool, not a system of record.

create extension if not exists pgcrypto;

create table groups (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  team_size int not null check (team_size between 3 and 11),
  status text not null default 'open' check (status in ('open', 'closed')),
  current_home_team_id uuid,
  current_away_team_id uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  label text not null,
  status text not null default 'forming' check (status in ('forming', 'queued', 'playing', 'done')),
  queue_position int,
  formed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (round_id, label)
);

alter table rounds
  add constraint rounds_current_home_team_fk foreign key (current_home_team_id) references teams(id),
  add constraint rounds_current_away_team_fk foreign key (current_away_team_id) references teams(id);

create table players (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  name text not null,
  arrival_order int not null,
  team_id uuid references teams(id) on delete set null,
  pin_slot text check (pin_slot in ('first', 'second')),
  is_injured boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (round_id, arrival_order)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  home_team_id uuid not null references teams(id),
  away_team_id uuid not null references teams(id),
  winner text not null check (winner in ('home', 'away', 'draw')),
  created_at timestamptz not null default now()
);

create index players_round_id_idx on players(round_id);
create index teams_round_id_idx on teams(round_id);
create index matches_round_id_idx on matches(round_id);

-- Realtime: broadcast row changes on everything a group page listens to.
alter publication supabase_realtime add table groups, rounds, teams, players, matches;

-- RLS: open policies (see file header for the tradeoff).
alter table groups enable row level security;
alter table rounds enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table matches enable row level security;

create policy "groups: anyone" on groups for all using (true) with check (true);
create policy "rounds: anyone" on rounds for all using (true) with check (true);
create policy "teams: anyone" on teams for all using (true) with check (true);
create policy "players: anyone" on players for all using (true) with check (true);
create policy "matches: anyone" on matches for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- RPCs: the game logic lives here so it's atomic under concurrent writers
-- (several phones editing the same group at once with no auth to arbitrate).
-- ---------------------------------------------------------------------------

-- Start a new round for a group, closing whatever round was open before.
create or replace function start_round(p_group_id uuid, p_team_size int)
returns rounds
language plpgsql
as $$
declare
  v_round rounds;
begin
  update rounds set status = 'closed', closed_at = now()
    where group_id = p_group_id and status = 'open';

  insert into rounds (group_id, team_size)
    values (p_group_id, p_team_size)
    returning * into v_round;

  return v_round;
end;
$$;

-- Add a player to the back of the arrival queue.
create or replace function add_player(p_round_id uuid, p_name text)
returns players
language plpgsql
as $$
declare
  v_player players;
  v_next_order int;
begin
  select coalesce(max(arrival_order), 0) + 1 into v_next_order
    from players where round_id = p_round_id;

  insert into players (round_id, name, arrival_order)
    values (p_round_id, p_name, v_next_order)
    returning * into v_player;

  return v_player;
end;
$$;

-- Toggle / set a player's pin slot ('first' | 'second' new team) before a draw.
create or replace function set_pin(p_player_id uuid, p_pin_slot text)
returns players
language plpgsql
as $$
declare
  v_player players;
  v_round_id uuid;
begin
  select round_id into v_round_id from players where id = p_player_id;

  -- Only one player per slot may be pinned at a time within a round.
  if p_pin_slot is not null then
    update players set pin_slot = null
      where round_id = v_round_id and pin_slot = p_pin_slot and id != p_player_id;
  end if;

  update players set pin_slot = p_pin_slot
    where id = p_player_id
    returning * into v_player;

  return v_player;
end;
$$;

-- Draw the next batch (2 x team_size waiting players) into two new teams.
-- Pinned players anchor one team each; the rest are shuffled and split evenly.
create or replace function confirm_draw(p_round_id uuid)
returns table (team_a_id uuid, team_b_id uuid)
language plpgsql
as $$
declare
  v_team_size int;
  v_waiting_count int;
  v_next_label_ord int;
  v_label_a text;
  v_label_b text;
  v_team_a teams;
  v_team_b teams;
  v_pinned_first uuid;
  v_pinned_second uuid;
  v_rest uuid[];
  v_home_id uuid;
  v_away_id uuid;
  v_next_queue_pos int;
  i int;
begin
  select team_size, current_home_team_id, current_away_team_id
    into v_team_size, v_home_id, v_away_id
    from rounds where id = p_round_id;

  select count(*) into v_waiting_count
    from players where round_id = p_round_id and team_id is null;

  if v_waiting_count < v_team_size * 2 then
    raise exception 'not enough waiting players for a draw: % of %', v_waiting_count, v_team_size * 2;
  end if;

  select count(*) into v_next_label_ord from teams where round_id = p_round_id;
  v_label_a := chr(65 + v_next_label_ord);
  v_label_b := chr(65 + v_next_label_ord + 1);

  insert into teams (round_id, label, status, formed_at)
    values (p_round_id, v_label_a, 'forming', now()) returning * into v_team_a;
  insert into teams (round_id, label, status, formed_at)
    values (p_round_id, v_label_b, 'forming', now()) returning * into v_team_b;

  select id into v_pinned_first from players
    where round_id = p_round_id and team_id is null and pin_slot = 'first' limit 1;
  select id into v_pinned_second from players
    where round_id = p_round_id and team_id is null and pin_slot = 'second' limit 1;

  if v_pinned_first is not null then
    update players set team_id = v_team_a.id, pin_slot = null where id = v_pinned_first;
  end if;
  if v_pinned_second is not null then
    update players set team_id = v_team_b.id, pin_slot = null where id = v_pinned_second;
  end if;

  select array_agg(id order by random()) into v_rest
    from players
    where round_id = p_round_id and team_id is null
      and id not in (coalesce(v_pinned_first, '00000000-0000-0000-0000-000000000000'),
                     coalesce(v_pinned_second, '00000000-0000-0000-0000-000000000000'));

  for i in 1 .. coalesce(array_length(v_rest, 1), 0) loop
    if (i % 2) = 1 then
      update players set team_id = v_team_a.id where id = v_rest[i];
    else
      update players set team_id = v_team_b.id where id = v_rest[i];
    end if;
  end loop;

  if v_home_id is null then
    update teams set status = 'playing' where id in (v_team_a.id, v_team_b.id);
    update rounds set current_home_team_id = v_team_a.id, current_away_team_id = v_team_b.id
      where id = p_round_id;
  else
    select coalesce(max(queue_position), 0) into v_next_queue_pos
      from teams where round_id = p_round_id and status = 'queued';
    update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_team_a.id;
    update teams set status = 'queued', queue_position = v_next_queue_pos + 2 where id = v_team_b.id;
  end if;

  return query select v_team_a.id, v_team_b.id;
end;
$$;

-- Record a match result and rotate the queue (winner stays, loser/draw go to the back).
create or replace function record_match_result(p_round_id uuid, p_winner text)
returns void
language plpgsql
as $$
declare
  v_home_id uuid;
  v_away_id uuid;
  v_next_queue_pos int;
  v_next_team_id uuid;
  v_next_team_id_2 uuid;
begin
  select current_home_team_id, current_away_team_id into v_home_id, v_away_id
    from rounds where id = p_round_id;

  if v_home_id is null or v_away_id is null then
    raise exception 'round % has no active match to resolve', p_round_id;
  end if;

  insert into matches (round_id, home_team_id, away_team_id, winner)
    values (p_round_id, v_home_id, v_away_id, p_winner);

  select coalesce(max(queue_position), 0) into v_next_queue_pos
    from teams where round_id = p_round_id and status = 'queued';

  if p_winner = 'draw' then
    update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_home_id;
    update teams set status = 'queued', queue_position = v_next_queue_pos + 2 where id = v_away_id;

    select id into v_next_team_id from teams
      where round_id = p_round_id and status = 'queued' order by queue_position asc limit 1;
    select id into v_next_team_id_2 from teams
      where round_id = p_round_id and status = 'queued' and id != coalesce(v_next_team_id, '00000000-0000-0000-0000-000000000000')
      order by queue_position asc limit 1;

    update teams set status = 'playing', queue_position = null where id in (v_next_team_id, v_next_team_id_2);
    update rounds set current_home_team_id = v_next_team_id, current_away_team_id = v_next_team_id_2
      where id = p_round_id;
  else
    -- whichever slot lost goes to the back; the other slot's winner stays put
    if p_winner = 'home' then
      update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_away_id;
    else
      update teams set status = 'queued', queue_position = v_next_queue_pos + 1 where id = v_home_id;
    end if;

    select id into v_next_team_id from teams
      where round_id = p_round_id and status = 'queued' order by queue_position asc limit 1;

    update teams set status = 'playing', queue_position = null where id = v_next_team_id;

    if p_winner = 'home' then
      update rounds set current_away_team_id = v_next_team_id where id = p_round_id;
    else
      update rounds set current_home_team_id = v_next_team_id where id = p_round_id;
    end if;
  end if;
end;
$$;

-- A player leaves injured: freed from their team, replaced by the first
-- person still waiting (arrival order), per "sai, entra o primeiro de fora".
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
