-- E-Cell club fair game — Supabase schema.
-- Run this once in the Supabase SQL editor (free tier is plenty).

create extension if not exists "pgcrypto";

-- One row per human. Email is the dedupe key: the same person on a second
-- phone still lands on the same leaderboard row.
create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid,                      -- the UUID the phone stores locally
  name        text not null,
  email       text not null unique,
  opted_in    boolean not null default false,
  best_score  integer not null default 0,
  runs        integer not null default 0,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists runs (
  id          uuid primary key,          -- comes from the signed start token
  player_id   uuid not null references players(id) on delete cascade,
  score       integer not null,
  duration_ms integer not null,
  fedoras     integer not null default 0,
  seed        bigint,
  created_at  timestamptz not null default now()
);

create index if not exists runs_player_created_idx on runs (player_id, created_at desc);
create index if not exists runs_created_idx on runs (created_at desc);
create index if not exists players_best_idx on players (best_score desc) where deleted = false;

-- Every rejected submission is kept so patterns are visible after the fair.
create table if not exists rejected_submissions (
  id         bigserial primary key,
  player_id  uuid,
  reason     text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- Funnel counters: qr_open -> onboard_complete -> first_run -> share.
create table if not exists events (
  id         bigserial primary key,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists events_name_created_idx on events (name, created_at desc);

-- Feature flags, e.g. freezing the leaderboard when the fair ends.
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);
insert into settings (key, value) values ('leaderboard_frozen', 'false'::jsonb)
  on conflict (key) do nothing;

-- Best score per player, ranked.
--
-- Deliberately a plain view rather than a materialized one: the booth display
-- has to show a new score within 5 seconds, and REFRESH MATERIALIZED VIEW on
-- every submit is both slower and more load than this indexed read. The best
-- score is denormalised onto players.best_score when a run is submitted, so
-- this view never touches the runs table.
create or replace view leaderboard as
  select
    row_number() over (order by best_score desc, updated_at asc) as rank,
    id as player_id,
    name,
    best_score,
    runs,
    updated_at
  from players
  where deleted = false and best_score > 0;

-- The API talks to Postgres with the service role key from a server-only
-- route handler, so row level security stays on with no policies: nothing is
-- reachable from the browser directly.
alter table players enable row level security;
alter table runs enable row level security;
alter table rejected_submissions enable row level security;
alter table events enable row level security;
alter table settings enable row level security;
