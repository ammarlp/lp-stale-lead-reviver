-- Run this in the Supabase SQL editor.
-- Adds per-user ownership of sub_accounts and wipes existing data (clean start).
-- After running this, the app requires every authenticated user to onboard a sub_account.

-- 1. Wipe existing data (sub_accounts, rules, drafts, events) — clean slate per spec.
truncate sub_accounts, revive_rules, drafts, revive_events restart identity cascade;

-- 2. Link sub_accounts to auth.users one-to-one.
alter table sub_accounts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 3. Each user owns at most one sub_account.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sub_accounts_user_id_key'
  ) then
    alter table sub_accounts add constraint sub_accounts_user_id_key unique (user_id);
  end if;
end$$;

-- 4. Require user_id on every sub_account going forward.
alter table sub_accounts alter column user_id set not null;

-- 5. Helper index for the auth middleware lookup.
create index if not exists sub_accounts_user_id_idx on sub_accounts (user_id);
