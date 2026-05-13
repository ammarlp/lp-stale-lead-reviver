import { Router } from 'express';
import { sb } from '../services/supabase';

export const dashboardRouter = Router();

dashboardRouter.get('/kpis', async (req, res) => {
  const ruleId = req.query.rule_id as string | undefined;

  const head = () => {
    let q = sb()
      .from('drafts')
      .select('*', { count: 'exact', head: true })
      .eq('sub_account_id', req.subAccountId!);
    if (ruleId) q = q.eq('rule_id', ruleId);
    return q;
  };

  const now = Date.now();
  const d7 = new Date(now - 7 * 86_400_000).toISOString();
  const d30 = new Date(now - 30 * 86_400_000).toISOString();

  const [s7, s30, pending, sent, replied, positive] = await Promise.all([
    head().gte('created_at', d7),
    head().gte('created_at', d30),
    head().eq('status', 'pending'),
    head().not('sent_at', 'is', null).gte('sent_at', d30),
    head().eq('status', 'replied').not('sent_at', 'is', null).gte('sent_at', d30),
    head().eq('reply_sentiment', 'positive').not('sent_at', 'is', null).gte('sent_at', d30),
  ]);

  const totalSent = sent.count || 0;
  const totalReplied = replied.count || 0;
  const totalPositive = positive.count || 0;

  res.json({
    surfaced_7d: s7.count || 0,
    surfaced_30d: s30.count || 0,
    pending: pending.count || 0,
    sent_30d: totalSent,
    replied_30d: totalReplied,
    positive_30d: totalPositive,
    reply_rate: totalSent ? Math.round((totalReplied / totalSent) * 100) : 0,
    positive_reply_rate: totalReplied ? Math.round((totalPositive / totalReplied) * 100) : 0,
  });
});

dashboardRouter.get('/timeseries', async (req, res) => {
  const ruleId = req.query.rule_id as string | undefined;
  const days = Math.min(parseInt((req.query.days as string) || '90'), 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let draftsQ = sb()
    .from('drafts')
    .select('created_at,sent_at,status,reply_sentiment')
    .eq('sub_account_id', req.subAccountId!)
    .gte('created_at', since);
  if (ruleId) draftsQ = draftsQ.eq('rule_id', ruleId);
  const { data: drafts, error } = await draftsQ;
  if (error) return res.status(500).json({ error: error.message });

  const buckets = new Map<string, { date: string; sends: number; replies: number; positive: number }>();
  const key = (iso: string) => iso.slice(0, 10);
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    buckets.set(d, { date: d, sends: 0, replies: 0, positive: 0 });
  }
  for (const d of drafts || []) {
    if (!d.sent_at) continue;
    const k = key(d.sent_at);
    const b = buckets.get(k);
    if (!b) continue;
    b.sends++;
    if (d.status === 'replied') b.replies++;
    if (d.reply_sentiment === 'positive') b.positive++;
  }
  res.json({ series: Array.from(buckets.values()) });
});

dashboardRouter.get('/rule-performance', async (req, res) => {
  const { data: rules, error: rErr } = await sb()
    .from('revive_rules')
    .select('id,name')
    .eq('sub_account_id', req.subAccountId!);
  if (rErr) return res.status(500).json({ error: rErr.message });

  const { data: drafts, error: dErr } = await sb()
    .from('drafts')
    .select('rule_id,status,reply_sentiment,sent_at')
    .eq('sub_account_id', req.subAccountId!);
  if (dErr) return res.status(500).json({ error: dErr.message });

  const byRule = new Map<string, { sent: number; replied: number; positive: number }>();
  for (const d of drafts || []) {
    if (!d.rule_id || !d.sent_at) continue;
    const entry = byRule.get(d.rule_id) || { sent: 0, replied: 0, positive: 0 };
    entry.sent++;
    if (d.status === 'replied') entry.replied++;
    if (d.reply_sentiment === 'positive') entry.positive++;
    byRule.set(d.rule_id, entry);
  }

  const rows = (rules || []).map((r: any) => {
    const stats = byRule.get(r.id) || { sent: 0, replied: 0, positive: 0 };
    return {
      rule_id: r.id,
      rule_name: r.name,
      sent: stats.sent,
      replied: stats.replied,
      positive: stats.positive,
      reply_rate: stats.sent ? Math.round((stats.replied / stats.sent) * 100) : 0,
    };
  });
  rows.sort((a, b) => b.reply_rate - a.reply_rate);
  res.json({ rows });
});
