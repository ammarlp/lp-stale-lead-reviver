-- Reply tracking — adds columns populated by the reply-check cron.
-- Safe to run on an existing database; all columns are additive and nullable.

alter table drafts add column if not exists reply_text text;
alter table drafts add column if not exists reply_received_at timestamptz;
alter table drafts add column if not exists reply_checked_at timestamptz;

-- Speeds up the "drafts to recheck" query (sent in last 30 days, not yet marked replied).
create index if not exists drafts_reply_check_idx
  on drafts (sub_account_id, sent_at)
  where status = 'sent';
