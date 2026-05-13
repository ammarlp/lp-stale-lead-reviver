import { Router } from 'express';
import { z } from 'zod';
import { listSubAccounts, upsertSubAccount, getSubAccount } from '../services/supabase';
import { GhlClient } from '../services/ghl';
import { draftMessage, hasAIKey } from '../services/ai';

export const settingsRouter = Router();

settingsRouter.get('/sub-accounts', async (_req, res) => {
  try {
    const subs = await listSubAccounts();
    // redact the API key before returning
    res.json({
      sub_accounts: subs.map((s) => ({ ...s, ghl_api_key: s.ghl_api_key ? '***' + s.ghl_api_key.slice(-4) : '' })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const subSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  ghl_location_id: z.string().min(1),
  ghl_api_key: z.string().min(1),
  brand_voice: z.string().nullable().optional(),
  timezone: z.string().default('UTC'),
  recovery_stage_id: z.string().nullable().optional(),
});

settingsRouter.post('/sub-account', async (req, res) => {
  try {
    const body = subSchema.parse(req.body);
    const sub = await upsertSubAccount(body);
    res.json({ sub_account: { ...sub, ghl_api_key: '***' + sub.ghl_api_key.slice(-4) } });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

settingsRouter.get('/ai-status', (_req, res) => {
  res.json({
    connected: hasAIKey(),
    mode: hasAIKey() ? 'ai' : 'template',
    message: hasAIKey()
      ? 'OpenAI connected — messages will be personalized with GPT-4o.'
      : 'Not connected — messages will use templates. Add your key to enable personalized drafts.',
  });
});

settingsRouter.post('/ai-test', async (_req, res) => {
  const { message, source } = await draftMessage({
    contact: { id: 'demo', firstName: 'Alex', tags: ['free-trial'] },
    channel: 'sms',
    pipelineStageName: 'Warm Leads / Demo Booked',
    contextSummary: 'Signed up for a free trial 95 days ago. Attended one demo. Never converted.',
    lastActivityRelative: '95 days ago',
    tags: ['free-trial', 'demo-booked'],
    brandVoice: 'Friendly, casual, concise. Often uses dashes for emphasis.',
    businessName: 'Demo Agency',
  });
  res.json({ message, source });
});

settingsRouter.get('/ghl/pipelines', async (req, res) => {
  const subId = req.query.sub_account_id as string;
  if (!subId) return res.status(400).json({ error: 'sub_account_id required' });
  const sub = await getSubAccount(subId);
  if (!sub) return res.status(404).json({ error: 'not found' });
  try {
    const ghl = new GhlClient(sub.ghl_api_key, sub.ghl_location_id);
    const pipelines = await ghl.listPipelines();
    res.json(pipelines);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

settingsRouter.get('/ghl/workflows', async (req, res) => {
  const subId = req.query.sub_account_id as string;
  if (!subId) return res.status(400).json({ error: 'sub_account_id required' });
  const sub = await getSubAccount(subId);
  if (!sub) return res.status(404).json({ error: 'not found' });
  try {
    const ghl = new GhlClient(sub.ghl_api_key, sub.ghl_location_id);
    const workflows = await ghl.listWorkflows();
    res.json(workflows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
