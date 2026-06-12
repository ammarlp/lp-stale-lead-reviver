import { sb, listSubAccounts, getSubAccount } from '../services/supabase';
import { GhlClient } from '../services/ghl';
import { classifyReply } from '../services/ai';
import type { SubAccount } from '../types';

export interface ReplyCheckResult {
  subAccountId: string;
  checked: number;
  replied: number;
  errors: string[];
}

const LOOKBACK_MS = 30 * 86_400_000;
const RECHECK_THROTTLE_MS = 30 * 60_000;

export async function runReplyCheck(options: { subAccountId?: string } = {}): Promise<ReplyCheckResult[]> {
  const subs = options.subAccountId
    ? ([await getSubAccount(options.subAccountId)].filter(Boolean) as SubAccount[])
    : await listSubAccounts();

  const results: ReplyCheckResult[] = [];
  for (const sub of subs) {
    const result: ReplyCheckResult = { subAccountId: sub.id, checked: 0, replied: 0, errors: [] };
    try {
      await checkSubAccount(sub, result);
    } catch (err) {
      result.errors.push((err as Error).message);
    }
    results.push(result);
  }
  return results;
}

async function checkSubAccount(sub: SubAccount, result: ReplyCheckResult): Promise<void> {
  const sentSince = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const recheckBefore = new Date(Date.now() - RECHECK_THROTTLE_MS).toISOString();

  const { data: drafts, error } = await sb()
    .from('drafts')
    .select('id, ghl_contact_id, sent_at, reply_checked_at')
    .eq('sub_account_id', sub.id)
    .eq('status', 'sent')
    .gte('sent_at', sentSince)
    .or(`reply_checked_at.is.null,reply_checked_at.lt.${recheckBefore}`)
    .order('sent_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  if (!drafts?.length) return;

  const ghl = new GhlClient(sub.ghl_api_key, sub.ghl_location_id);
  const nowIso = new Date().toISOString();

  for (const draft of drafts) {
    result.checked++;
    try {
      const sentAtMs = draft.sent_at ? Date.parse(draft.sent_at) : 0;
      if (!sentAtMs) {
        await markChecked(draft.id, nowIso);
        continue;
      }

      const reply = await findReply(ghl, draft.ghl_contact_id, sentAtMs);
      if (!reply) {
        await markChecked(draft.id, nowIso);
        continue;
      }

      const sentiment = await classifyReply(reply.text);
      const { error: uErr } = await sb()
        .from('drafts')
        .update({
          status: 'replied',
          reply_text: reply.text.slice(0, 4000),
          reply_received_at: new Date(reply.atMs).toISOString(),
          reply_sentiment: sentiment,
          reply_checked_at: nowIso,
        })
        .eq('id', draft.id);
      if (uErr) throw uErr;

      await sb().from('revive_events').insert({
        draft_id: draft.id,
        event_type: 'replied',
        metadata: { sentiment, preview: reply.text.slice(0, 200) },
      });
      result.replied++;
    } catch (err) {
      result.errors.push(`draft ${draft.id}: ${(err as Error).message}`);
    }
  }
}

async function markChecked(draftId: string, nowIso: string): Promise<void> {
  await sb().from('drafts').update({ reply_checked_at: nowIso }).eq('id', draftId);
}

interface FoundReply {
  text: string;
  atMs: number;
}

async function findReply(ghl: GhlClient, contactId: string, sentAtMs: number): Promise<FoundReply | null> {
  const search = await ghl.searchConversations(contactId, 5).catch(() => null);
  const conversations: any[] = search?.conversations || [];
  if (!conversations.length) return null;

  let best: FoundReply | null = null;

  for (const conv of conversations) {
    const lastDirection = conv.lastMessageDirection || conv.direction || null;
    const lastDate = toMs(conv.lastMessageDate || conv.lastUpdated);
    const candidateFromSearch =
      lastDirection === 'inbound' && lastDate && lastDate > sentAtMs
        ? { text: String(conv.lastMessageBody || '').trim(), atMs: lastDate }
        : null;

    let candidate: FoundReply | null = candidateFromSearch?.text ? candidateFromSearch : null;

    if (!candidate && conv.id) {
      try {
        const msgs = await ghl.listConversationMessages(conv.id, 20);
        const list: any[] = msgs?.messages?.messages || msgs?.messages || [];
        for (const m of list) {
          const dir = m.direction || m.messageDirection;
          if (dir !== 'inbound') continue;
          const atMs = toMs(m.dateAdded || m.createdAt || m.timestamp);
          if (!atMs || atMs <= sentAtMs) continue;
          const body = String(m.body || m.message || m.text || '').trim();
          if (!body) continue;
          if (!candidate || atMs > candidate.atMs) candidate = { text: body, atMs };
        }
      } catch {
        /* non-fatal — fall back to search result if any */
      }
    }

    if (candidate && (!best || candidate.atMs > best.atMs)) best = candidate;
  }

  return best;
}

function toMs(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n > 1e12 ? n : n * 1000;
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
