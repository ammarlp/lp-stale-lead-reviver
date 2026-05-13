import { Router } from 'express';
import { z } from 'zod';
import { sb, getSubAccount } from '../services/supabase';
import { GhlClient } from '../services/ghl';
import { draftMessage } from '../services/ai';

export const draftsRouter = Router();

draftsRouter.get('/', async (req, res) => {
  const status = (req.query.status as string) || 'pending';
  const subId = req.query.sub_account_id as string | undefined;
  const ruleId = req.query.rule_id as string | undefined;
  const channel = req.query.channel as string | undefined;

  let q = sb().from('drafts').select('*').order('created_at', { ascending: false }).limit(500);
  if (status && status !== 'all') q = q.eq('status', status);
  if (subId) q = q.eq('sub_account_id', subId);
  if (ruleId) q = q.eq('rule_id', ruleId);
  if (channel) q = q.eq('channel', channel);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ drafts: data || [] });
});

draftsRouter.get('/:id', async (req, res) => {
  const { data, error } = await sb().from('drafts').select('*').eq('id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'not found' });
  const { data: events } = await sb()
    .from('revive_events')
    .select('*')
    .eq('draft_id', req.params.id)
    .order('created_at');
  res.json({ draft: data, events: events || [] });
});

draftsRouter.patch('/:id', async (req, res) => {
  const body = z
    .object({
      draft_message: z.string().optional(),
      channel: z.enum(['sms', 'email']).optional(),
      status: z.enum(['pending', 'approved', 'edited', 'rejected']).optional(),
    })
    .parse(req.body);

  const { data, error } = await sb().from('drafts').update(body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ draft: data });
});

draftsRouter.post('/:id/reject', async (req, res) => {
  const { data, error } = await sb()
    .from('drafts')
    .update({ status: 'rejected' })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  await sb().from('revive_events').insert({ draft_id: data.id, event_type: 'rejected', metadata: {} });
  res.json({ draft: data });
});

draftsRouter.post('/:id/regenerate', async (req, res) => {
  const { data: draft, error } = await sb().from('drafts').select('*').eq('id', req.params.id).single();
  if (error || !draft) return res.status(404).json({ error: 'not found' });
  const sub = await getSubAccount(draft.sub_account_id);
  if (!sub) return res.status(404).json({ error: 'sub_account not found' });

  const { message, source } = await draftMessage({
    contact: draft.contact_snapshot,
    channel: draft.channel,
    pipelineStageName: draft.contact_snapshot.pipelineStageName,
    contextSummary: draft.context_summary,
    lastActivityRelative: draft.contact_snapshot.lastActivity
      ? new Date(Number(draft.contact_snapshot.lastActivity)).toDateString()
      : 'unknown',
    tags: draft.contact_snapshot.tags || [],
    brandVoice: sub.brand_voice,
    businessName: sub.name,
  });

  const { data: updated, error: uErr } = await sb()
    .from('drafts')
    .update({ draft_message: message, draft_source: source })
    .eq('id', req.params.id)
    .select()
    .single();
  if (uErr) return res.status(500).json({ error: uErr.message });
  res.json({ draft: updated });
});

draftsRouter.post('/:id/approve', async (req, res) => {
  const { data: draft, error } = await sb().from('drafts').select('*').eq('id', req.params.id).single();
  if (error || !draft) return res.status(404).json({ error: 'not found' });
  if (draft.status === 'sent') return res.status(400).json({ error: 'already sent' });

  const sub = await getSubAccount(draft.sub_account_id);
  if (!sub) return res.status(400).json({ error: 'sub_account not found' });

  const ghl = new GhlClient(sub.ghl_api_key, sub.ghl_location_id);

  try {
    const messageBody: any = {
      type: draft.channel === 'sms' ? 'SMS' : 'Email',
      contactId: draft.ghl_contact_id,
    };
    if (draft.channel === 'sms') {
      messageBody.message = draft.draft_message;
    } else {
      messageBody.html = draft.draft_message.replace(/\n/g, '<br/>');
      messageBody.subject = 'Quick follow-up';
    }
    const sendRes = await ghl.sendMessage(messageBody);

    // auto-tag contact
    if (draft.rule_id) {
      try {
        await ghl.addTag(draft.ghl_contact_id, [`revive-sent-${draft.rule_id}`]);
      } catch (e) {
        /* non-fatal */
      }
    }

    const { data: updated, error: uErr } = await sb()
      .from('drafts')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', draft.id)
      .select()
      .single();
    if (uErr) throw uErr;

    await sb().from('revive_events').insert({
      draft_id: draft.id,
      event_type: 'sent',
      metadata: { ghl_response: sendRes },
    });

    res.json({ draft: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

draftsRouter.post('/:id/push-to-workflow', async (req, res) => {
  const body = z.object({ workflow_id: z.string().min(1) }).parse(req.body);
  const { data: draft, error } = await sb().from('drafts').select('*').eq('id', req.params.id).single();
  if (error || !draft) return res.status(404).json({ error: 'not found' });
  const sub = await getSubAccount(draft.sub_account_id);
  if (!sub) return res.status(400).json({ error: 'sub_account not found' });
  const ghl = new GhlClient(sub.ghl_api_key, sub.ghl_location_id);
  try {
    const result = await ghl.addContactToWorkflow(draft.ghl_contact_id, body.workflow_id);
    await sb().from('revive_events').insert({
      draft_id: draft.id,
      event_type: 'pushed_to_workflow',
      metadata: { workflow_id: body.workflow_id, ghl_response: result },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

draftsRouter.post('/bulk-approve', async (req, res) => {
  const body = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);
  const results: any[] = [];
  for (const id of body.ids) {
    try {
      // Re-use approve logic via internal call
      const { data: draft } = await sb().from('drafts').select('*').eq('id', id).single();
      if (!draft || draft.status === 'sent') {
        results.push({ id, ok: false, error: 'invalid state' });
        continue;
      }
      const sub = await getSubAccount(draft.sub_account_id);
      if (!sub) {
        results.push({ id, ok: false, error: 'no sub_account' });
        continue;
      }
      const ghl = new GhlClient(sub.ghl_api_key, sub.ghl_location_id);
      const messageBody: any = {
        type: draft.channel === 'sms' ? 'SMS' : 'Email',
        contactId: draft.ghl_contact_id,
      };
      if (draft.channel === 'sms') messageBody.message = draft.draft_message;
      else {
        messageBody.html = draft.draft_message.replace(/\n/g, '<br/>');
        messageBody.subject = 'Quick follow-up';
      }
      await ghl.sendMessage(messageBody);
      await sb().from('drafts').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
      await sb().from('revive_events').insert({ draft_id: id, event_type: 'sent', metadata: { bulk: true } });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message });
    }
  }
  res.json({ results });
});
