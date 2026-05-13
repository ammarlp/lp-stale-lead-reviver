import './env';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { draftsRouter } from './routes/drafts';
import { rulesRouter } from './routes/rules';
import { settingsRouter } from './routes/settings';
import { webhooksRouter } from './routes/webhooks';
import { cronRouter } from './routes/cron';
import { dashboardRouter } from './routes/dashboard';
import { runScan } from './cron/scan';
import { hasAIKey } from './services/ai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: hasAIKey() ? 'connected' : 'template-fallback', ts: Date.now() });
});

app.use('/api/drafts', draftsRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/webhook', webhooksRouter);
app.use('/api/cron', cronRouter);
app.use('/api/dashboard', dashboardRouter);

// Resolves to <repo>/client/dist whether running from src (tsx) or dist (node).
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log(`[server] serving client from ${clientDist}`);
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
