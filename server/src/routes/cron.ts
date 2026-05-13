import { Router } from 'express';
import { runScan } from '../cron/scan';

export const cronRouter = Router();

cronRouter.post('/scan', async (req, res) => {
  try {
    const ruleId = (req.body && req.body.rule_id) || undefined;
    const results = await runScan({ subAccountId: req.subAccountId!, ruleId });
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
