import './env';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { z } from 'zod';
import { draftsRouter } from './routes/drafts';
import { rulesRouter } from './routes/rules';
import { settingsRouter } from './routes/settings';
import { webhooksRouter } from './routes/webhooks';
import { cronRouter } from './routes/cron';
import { dashboardRouter } from './routes/dashboard';
import { runScan } from './cron/scan';
import { runReplyCheck } from './cron/reply-check';
import { hasAIKey } from './services/ai';
import { requireAuth, attachSubAccount, requireSubAccount } from './middleware/auth';
import { createSubAccountForUser, getSubAccountByUser } from './services/supabase';

const BASE_PATH = '/lead-reviver';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Public — no auth required
app.get(`${BASE_PATH}/api/health`, (_req, res) => {
  res.json({ ok: true, ai: hasAIKey() ? 'connected' : 'template-fallback', ts: Date.now() });
});
app.use(`${BASE_PATH}/api/webhook`, webhooksRouter); // guarded by webhook secret

// Onboarding: authenticated, but does not require a sub_account to exist yet
const onboardingSchema = z.object({
  name: z.string().min(1),
  ghl_location_id: z.string().min(1),
  ghl_api_key: z.string().min(1),
  brand_voice: z.string().nullable().optional(),
  timezone: z.string().default('UTC'),
  recovery_stage_id: z.string().nullable().optional(),
});
app.post(`${BASE_PATH}/api/onboarding`, requireAuth, async (req, res) => {
  try {
    const existing = await getSubAccountByUser(req.userId!);
    if (existing) return res.status(409).json({ error: 'already onboarded' });
    const body = onboardingSchema.parse(req.body);
    const sub = await createSubAccountForUser(req.userId!, body);
    res.json({ sub_account: { ...sub, ghl_api_key: '***' + sub.ghl_api_key.slice(-4) } });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Authenticated routes that require a completed onboarding
const protectedFull = [requireAuth, attachSubAccount, requireSubAccount];
app.use(`${BASE_PATH}/api/drafts`, protectedFull, draftsRouter);
app.use(`${BASE_PATH}/api/rules`, protectedFull, rulesRouter);
app.use(`${BASE_PATH}/api/cron`, protectedFull, cronRouter);
app.use(`${BASE_PATH}/api/dashboard`, protectedFull, dashboardRouter);

// Settings is authenticated but onboarding-optional (Settings endpoints handle the no-subaccount case).
app.use(`${BASE_PATH}/api/settings`, requireAuth, settingsRouter);

// Resolves to <repo>/client/dist whether running from src (tsx) or dist (node).
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(BASE_PATH, express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (!req.path.startsWith(BASE_PATH)) return next();
    if (req.path.startsWith(`${BASE_PATH}/api`)) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  app.get('/', (_req, res) => res.redirect(BASE_PATH));
  console.log(`[server] serving client from ${clientDist} at ${BASE_PATH}`);
} else {
  console.warn(`[server] client build not found at ${clientDist} — API-only mode`);
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[server] listening on :${port}`);
  console.log(`[server] AI mode: ${hasAIKey() ? 'OpenAI (GPT-4o)' : 'Template fallback (no OPENAI_API_KEY set)'}`);
});

const schedule = process.env.CRON_SCHEDULE || '0 8 * * *';
if (cron.validate(schedule)) {
  cron.schedule(schedule, async () => {
    console.log('[cron] running daily scan');
    try {
      const results = await runScan();
      console.log('[cron] scan results:', JSON.stringify(results));
    } catch (err) {
      console.error('[cron] scan failed:', err);
    }
  });
  console.log(`[cron] scheduled: ${schedule}`);
} else {
  console.warn(`[cron] invalid CRON_SCHEDULE: ${schedule}`);
}

const replySchedule = process.env.REPLY_CHECK_SCHEDULE || '*/30 * * * *';
if (cron.validate(replySchedule)) {
  cron.schedule(replySchedule, async () => {
    try {
      const results = await runReplyCheck();
      const totals = results.reduce(
        (acc, r) => ({ checked: acc.checked + r.checked, replied: acc.replied + r.replied }),
        { checked: 0, replied: 0 }
      );
      if (totals.checked > 0) {
        console.log(`[cron] reply-check: ${totals.checked} checked, ${totals.replied} new replies`);
      }
    } catch (err) {
      console.error('[cron] reply-check failed:', err);
    }
  });
  console.log(`[cron] reply-check scheduled: ${replySchedule}`);
} else {
  console.warn(`[cron] invalid REPLY_CHECK_SCHEDULE: ${replySchedule}`);
}
