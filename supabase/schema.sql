-- Communion of Saints: database setup.
-- Paste this whole file into Supabase > SQL Editor > New query > Run. Safe to run more than once.
--
-- How it is locked down: the three tables below have row level security ON and NO policies,
-- so the public (anon) key cannot read or write them directly. The only way in is through the
-- functions further down. Players can only touch their own row (they hold a secret), and only
-- the host (who holds the host key) can change the game state or see answers before the reveal.

create schema if not exists private;

create table if not exists public.games (
  code        text primary key,
  host_key    text not null,
  state       jsonb not null default '{"phase":"lobby","format":"standard"}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.players (
  id          uuid primary key,
  game_code   text not null references public.games(code) on delete cascade,
  secret      text not null,
  name        text not null,
  saint       text not null,
  types       text[] not null default '{}',
  blurb       text not null default '',
  joined_at   timestamptz not null default now()
);
create index if not exists players_game_idx on public.players(game_code);

-- Only a player's latest answer is kept: one row per player.
create table if not exists public.answers (
  game_code   text not null references public.games(code) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  clash_key   text not null,
  choice      int  not null check (choice between 0 and 3),
  ability     boolean not null default false,
  at          timestamptz not null default now(),
  primary key (game_code, player_id)
);

alter table public.games   enable row level security;
alter table public.players enable row level security;
alter table public.answers enable row level security;
revoke all on public.games, public.players, public.answers from anon, authenticated;

-- ---------- private helpers (not reachable from the browser) ----------

create or replace function private.is_host(p_code text, p_key text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from games where code = p_code and host_key = p_key and p_key is not null);
$$;

create or replace function private.check_person(p_name text, p_saint text, p_types text[], p_blurb text) returns void
language plpgsql immutable as $$
begin
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 40 then raise exception 'Enter a name (40 characters max).'; end if;
  if p_saint is null or length(btrim(p_saint)) = 0 or length(p_saint) > 60 then raise exception 'Enter a saint (60 characters max).'; end if;
  if p_blurb is not null and length(p_blurb) > 160 then raise exception 'Keep the line about your saint under 160 characters.'; end if;
  if p_types is null or coalesce(array_length(p_types, 1), 0) not between 1 and 2 then raise exception 'Pick one or two saint types.'; end if;
  if not (p_types <@ array['martyr','warrior','doctor','mystic','missionary','founder','shepherd','servant']) then raise exception 'Unknown saint type.'; end if;
end $$;

-- ---------- public functions (the app calls these) ----------

create or replace function public.create_game(p_code text, p_host_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_code !~ '^[A-Z]{4}$' then raise exception 'Bad game code.'; end if;
  if p_host_key is null or length(p_host_key) < 16 then raise exception 'Bad host key.'; end if;
  delete from games where created_at < now() - interval '3 days';  -- housekeeping
  insert into games (code, host_key) values (p_code, p_host_key);
end $$;

-- Everything a phone needs, in one call. Never includes secrets or host keys.
create or replace function public.get_game(p_code text) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'state', g.state,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'saint', p.saint,
                                          'types', to_jsonb(p.types), 'blurb', p.blurb) order by p.joined_at)
      from players p where p.game_code = g.code), '[]'::jsonb)
  ) from games g where g.code = p_code;
$$;

create or replace function public.join_game(p_code text, p_id uuid, p_secret text, p_name text, p_saint text, p_types text[], p_blurb text) returns void
language plpgsql security definer set search_path = public as $$
declare ph text; existing text; n int;
begin
  select coalesce(state->>'phase', 'lobby') into ph from games where code = p_code;
  if not found then raise exception 'No game with that code.'; end if;
  if ph <> 'lobby' then raise exception 'The game has already started.'; end if;
  if p_secret is null or length(p_secret) < 16 then raise exception 'Bad player key.'; end if;
  perform private.check_person(p_name, p_saint, p_types, p_blurb);
  select secret into existing from players where id = p_id;
  if found then
    if existing <> p_secret then raise exception 'That seat belongs to someone else.'; end if;
    update players set name = btrim(p_name), saint = btrim(p_saint), types = p_types, blurb = coalesce(btrim(p_blurb), '')
      where id = p_id and game_code = p_code;
  else
    select count(*) into n from players where game_code = p_code;
    if n >= 40 then raise exception 'This game is full.'; end if;
    insert into players (id, game_code, secret, name, saint, types, blurb)
      values (p_id, p_code, p_secret, btrim(p_name), btrim(p_saint), p_types, coalesce(btrim(p_blurb), ''));
  end if;
end $$;

create or replace function public.leave_game(p_code text, p_id uuid, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select coalesce(state->>'phase', 'lobby') from games where code = p_code) = 'lobby' then
    delete from players where game_code = p_code and id = p_id and secret = p_secret;
  end if;
end $$;

create or replace function public.submit_answer(p_code text, p_id uuid, p_secret text, p_key text, p_choice int, p_ability boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from players where game_code = p_code and id = p_id and secret = p_secret) then
    raise exception 'Not a player in this game.';
  end if;
  insert into answers (game_code, player_id, clash_key, choice, ability)
    values (p_code, p_id, p_key, p_choice, coalesce(p_ability, false))
  on conflict (game_code, player_id) do update
    set clash_key = excluded.clash_key, choice = excluded.choice, ability = excluded.ability, at = now();
end $$;

-- ---------- host-only functions ----------

create or replace function public.set_state(p_code text, p_host_key text, p_state jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_host(p_code, p_host_key) then raise exception 'Not the host.'; end if;
  if pg_column_size(p_state) > 200000 then raise exception 'State too large.'; end if;
  update games set state = p_state, updated_at = now() where code = p_code;
end $$;

create or replace function public.get_answers(p_code text, p_host_key text) returns jsonb
language plpgsql security definer set search_path = public stable as $$
begin
  if not private.is_host(p_code, p_host_key) then raise exception 'Not the host.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('player_id', player_id, 'key', clash_key, 'choice', choice, 'ability', ability))
                   from answers where game_code = p_code), '[]'::jsonb);
end $$;

create or replace function public.host_add_player(p_code text, p_host_key text, p_id uuid, p_name text, p_saint text, p_types text[], p_blurb text) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not private.is_host(p_code, p_host_key) then raise exception 'Not the host.'; end if;
  if (select coalesce(state->>'phase', 'lobby') from games where code = p_code) <> 'lobby' then raise exception 'The game has already started.'; end if;
  perform private.check_person(p_name, p_saint, p_types, p_blurb);
  select count(*) into n from players where game_code = p_code;
  if n >= 40 then raise exception 'This game is full.'; end if;
  insert into players (id, game_code, secret, name, saint, types, blurb)
    values (p_id, p_code, 'host-added-' || p_id::text, btrim(p_name), btrim(p_saint), p_types, coalesce(btrim(p_blurb), ''));
end $$;

create or replace function public.host_answer(p_code text, p_host_key text, p_player_id uuid, p_key text, p_choice int, p_ability boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_host(p_code, p_host_key) then raise exception 'Not the host.'; end if;
  insert into answers (game_code, player_id, clash_key, choice, ability)
    values (p_code, p_player_id, p_key, p_choice, coalesce(p_ability, false))
  on conflict (game_code, player_id) do update
    set clash_key = excluded.clash_key, choice = excluded.choice, ability = excluded.ability, at = now();
end $$;

create or replace function public.kick_player(p_code text, p_host_key text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_host(p_code, p_host_key) then raise exception 'Not the host.'; end if;
  delete from players where game_code = p_code and id = p_id;
end $$;

create or replace function public.clear_players(p_code text, p_host_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_host(p_code, p_host_key) then raise exception 'Not the host.'; end if;
  delete from players where game_code = p_code;
end $$;

grant execute on function
  public.create_game(text, text), public.get_game(text),
  public.join_game(text, uuid, text, text, text, text[], text), public.leave_game(text, uuid, text),
  public.submit_answer(text, uuid, text, text, int, boolean),
  public.set_state(text, text, jsonb), public.get_answers(text, text),
  public.host_add_player(text, text, uuid, text, text, text[], text),
  public.host_answer(text, text, uuid, text, int, boolean),
  public.kick_player(text, text, uuid), public.clear_players(text, text)
to anon, authenticated;

notify pgrst, 'reload schema';
