-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New Query)

create table if not exists query_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,   -- Clerk user ID (e.g. user_2abc...)
  question    text not null,
  answer      text not null,
  steps       text[] not null default '{}',
  sources     text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- Efficient lookup: all queries by a user, newest first
create index if not exists query_history_user_created
  on query_history (user_id, created_at desc);
