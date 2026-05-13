-- Stale Lead Reviver — Supabase schema
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists sub_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  ghl_location_id text unique not null,
  ghl_api_key text not null,           -- AES-256 encrypted (iv:ciphertext:tag hex)
  name text not null,
  brand_voice text,
  timezone text default 'UTC',
  recovery_stage_id text,               -- optional: where to move positive replies
  created_at timestamptz default now()
);
create index if not exists sub_accounts_user_id_idx on sub_accounts (user_id);

create table if not exists revive_rules (
  id uuid primary key default gen_random_uuid(),
  sub_account_id uuid references sub_accounts(id) on delete cascade,
  name text not null,
  inactivity_days int not null,
  pipeline_stage_ids text[],
  include_tags text[],
  exclude_tags text[],
  activity_sources text[],            -- match against contact.source / attributionSource
  channel text check (channel in ('sms','email','auto')) default 'auto',
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table revive_rules add column if not exists activity_sources text[];

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  sub_account_id uuid references sub_accounts(id),
  rule_id uuid references revive_rules(id),
  ghl_contact_id text not null,
  contact_snapshot jsonb not null,
  context_summary text not null,
  channel text not null,
  draft_message text not null,
  draft_source text check (draft_source in ('ai','template')) default 'template',
  status text check (status in ('pending','approved','edited','rejected','sent','replied')) default 'pending',
  approved_by uuid,
  sent_at timestamptz,
  reply_sentiment text,
  created_at timestamptz default now()
);

create table if not exists revive_events (
  id bigserial primary key,
  draft_id uuid references drafts(id),
  event_type text,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists drafts_sub_status_idx on drafts (sub_account_id, status);
create index if not exists drafts_contact_idx on drafts (ghl_contact_id);
create index if not exists drafts_created_idx on drafts (created_at);
create index if not exists events_draft_idx on revive_events (draft_id);

-- RLS: service key bypasses RLS, so we enable it for safety but the server uses service role.
alter table sub_accounts enable row level security;
alter table revive_rules enable row level security;
alter table drafts enable row level security;
alter table revive_events enable row level security;
