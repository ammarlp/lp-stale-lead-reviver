import { Router } from 'express';
import { runScan } from '../cron/scan';

export const cronRouter = Router();

cronRouter.post('/scan', async (req, res) => {
  try {
    const { sub_account_id, rule_id } = req.body || {};
    const results = await runScan({ subAccountId: sub_account_id, ruleId: rule_id });
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
