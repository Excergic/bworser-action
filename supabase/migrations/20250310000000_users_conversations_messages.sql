-- StudyMate: Users, Conversations, Messages schema (replaces qa_history)

-- Drop legacy table if it exists
drop table if exists public.qa_history;

-- Users — who they are (synced from Clerk via backend)
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Conversations — each session/chat
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index conversations_user_id_idx on public.conversations(user_id);

-- Messages — each Q&A within a conversation
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages(conversation_id);

comment on table public.users is 'StudyMate users (email from Clerk)';
comment on table public.conversations is 'Chat sessions per user';
comment on table public.messages is 'Q&A pairs within a conversation';
