import { Router } from 'express';
import { sb, getSubAccount, getSubAccountByLocation } from '../services/supabase';
import { GhlClient } from '../services/ghl';
import { classifyReply } from '../services/ai';

export const webhooksRouter = Router();

// GHL inbound message webhook.
// Configure GHL to POST to /api/webhook/ghl-inbound?secret=GHL_WEBHOOK_SECRET
webhooksRouter.post('/ghl-inbound', async (req, res) => {
  const secret = req.query.secret || req.header('x-webhook-secret');
  if (!process.env.GHL_WEBHOOK_SECRET || secret !== process.env.GHL_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'invalid secret' });
  }

  const body = req.body || {};
  const locationId = body.locationId || body.location_id;
  const contactId = body.contactId || body.contact_id || body.contact?.id;
  const messageBody: string =
    body.body || body.message || body.messageBody || body.lastMessageBody || '';
  const direction = body.direction || body.messageDirection; // expect "inbound"

  if (direction && direction !== 'inbound') return res.json({ ignored: true });
  if (!contactId || !messageBody) return res.status(400).json({ error: 'missing contactId/body' });

  // Find the most recent sent draft for this contact in last 14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: drafts, error } = await sb()
    .from('drafts')
    .select('*')
    .eq('ghl_contact_id', contactId)
    .eq('status', 'sent')
    .gte('sent_at', fourteenDaysAgo)
    .order('sent_at', { ascending: false })
    .limit(1);
  if (error) return res.status(500).json({ error: error.message });
  if (!drafts?.length) return res.json({ matched: false });

  const draft = drafts[0];
  const sentiment = await classifyReply(messageBody);

  await sb()
    .from('drafts')
    .update({ status: 'replied', reply_sentiment: sentiment })
    .eq('id', draft.id);

  await sb().from('revive_events').insert({
    draft_id: draft.id,
    event_type: `reply_${sentiment}`,
    metadata: { message: messageBody.slice(0, 500) },
  });

  // Apply GHL tags based on sentiment
  try {
    const sub =
      (locationId ? await getSubAccountByLocation(locationId) : null) ||
      (await getSubAccount(draft.sub_account_id));
    if (sub) {
      const ghl = new GhlClient(sub.ghl_api_key, sub.ghl_location_id);
      if (sentiment === 'positive') {
        await ghl.addTag(contactId, ['revive-interested']);
        if (sub.recovery_stage_id) {
          try {
            const opps = await ghl.searchOpportunitiesByContact(contactId);
            const op = (opps?.opportunities || [])[0];
            if (op) await ghl.updateOpportunity(op.id, { pipelineStageId: sub.recovery_stage_id });
          } catch { /* non-fatal */ }
        }
      } else if (sentiment === 'unsubscribe') {
        await ghl.addTag(contactId, ['revive-unsubscribe', 'DNC']);
        try {
          await ghl.updateContact(contactId, { dnd: true });
        } catch { /* non-fatal */ }
      } else if (sentiment === 'negative') {
        await ghl.addTag(contactId, ['revive-declined']);
      } else {
        await ghl.addTag(contactId, ['revive-replied']);
      }
    }
  } catch (err) {
    // non-fatal, still record the reply
    console.warn('[webhook] tagging failed:', (err as Error).message);
  }

  res.json({ matched: true, draft_id: draft.id, sentiment });
});
