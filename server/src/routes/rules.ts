import { Router } from 'express';
import { z } from 'zod';
import { sb } from '../services/supabase';

export const rulesRouter = Router();

const ruleSchema = z.object({
  name: z.string().min(1),
  inactivity_days: z.number().int().positive(),
  pipeline_stage_ids: z.array(z.string()).nullable().optional(),
  include_tags: z.array(z.string()).nullable().optional(),
  exclude_tags: z.array(z.string()).nullable().optional(),
  channel: z.enum(['sms', 'email', 'auto']).default('auto'),
  is_active: z.boolean().default(true),
});

rulesRouter.get('/', async (req, res) => {
  const { data, error } = await sb()
    .from('revive_rules')
    .select('*')
    .eq('sub_account_id', req.subAccountId!)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ rules: data || [] });
});

rulesRouter.post('/', async (req, res) => {
  const body = ruleSchema.parse(req.body);
  const { data, error } = await sb()
    .from('revive_rules')
    .insert({ ...body, sub_account_id: req.subAccountId! })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ rule: data });
});

rulesRouter.patch('/:id', async (req, res) => {
  const body = ruleSchema.partial().parse(req.body);
  const { data, error } = await sb()
    .from('revive_rules')
    .update(body)
    .eq('id', req.params.id)
    .eq('sub_account_id', req.subAccountId!)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'not found' });
  res.json({ rule: data });
});

rulesRouter.delete('/:id', async (req, res) => {
  const { error } = await sb()
    .from('revive_rules')
    .delete()
    .eq('id', req.params.id)
    .eq('sub_account_id', req.subAccountId!);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
