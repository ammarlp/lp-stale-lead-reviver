import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Loader2, PlayCircle } from 'lucide-react';
import { ScanResultBanner, type ScanResultPayload } from '@/components/ScanResultBanner';

const ALL = '__all__';

export default function Dashboard() {
  const [kpis, setKpis] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [perf, setPerf] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [subFilter, setSubFilter] = useState<string>(ALL);
  const [ruleFilter, setRuleFilter] = useState<string>(ALL);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultPayload | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanSubChoice, setScanSubChoice] = useState<string>(ALL);
  const [scanRuleChoice, setScanRuleChoice] = useState<string>(ALL);

  const subId = subFilter === ALL ? undefined : subFilter;
  const ruleId = ruleFilter === ALL ? undefined : ruleFilter;

  async function loadAux() {
    const [{ rules }, { sub_accounts }] = await Promise.all([api.listRules(), api.listSubAccounts()]);
    setRules(rules);
    setSubs(sub_accounts);
  }

  async function loadStats() {
    const [k, ts, rp] = await Promise.all([
      api.kpis(subId, ruleId),
      api.timeseries(subId, ruleId, 90),
      api.rulePerformance(subId),
    ]);
    setKpis(k);
    setSeries(ts.series);
    setPerf(rp.rows);
  }

  useEffect(() => {
    loadAux().catch(console.error);
  }, []);

  useEffect(() => {
    loadStats().catch(console.error);
  }, [subFilter, ruleFilter]);

  // Keep rule filter valid when sub-account filter changes.
  const visibleRules = useMemo(
    () => (subId ? rules.filter((r) => r.sub_account_id === subId) : rules),
    [rules, subId]
  );
  useEffect(() => {
    if (ruleFilter !== ALL && !visibleRules.some((r) => r.id === ruleFilter)) {
      setRuleFilter(ALL);
    }
  }, [subFilter, visibleRules, ruleFilter]);

  function openScanDialog() {
    // Default to whatever's already filtered on the page (if anything)
    setScanSubChoice(subFilter);
    setScanRuleChoice(ruleFilter);
    setScanOpen(true);
  }

  async function confirmScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const r: any = await api.runScan({
        sub_account_id: scanSubChoice === ALL ? undefined : scanSubChoice,
        rule_id: scanRuleChoice === ALL ? undefined : scanRuleChoice,
      });
      const totals = r.results.reduce(
        (acc: any, x: any) => ({
          drafted: acc.drafted + x.drafted,
          scanned: acc.scanned + x.scanned,
          skipped: acc.skipped + x.skipped,
          errors: [...acc.errors, ...(x.errors || [])],
        }),
        { drafted: 0, scanned: 0, skipped: 0, errors: [] as string[] }
      );
      const chosenRule = scanRuleChoice === ALL ? undefined : rules.find((r) => r.id === scanRuleChoice);
      setScanResult({
        totals,
        ruleId: chosenRule?.id,
        ruleName: chosenRule?.name,
      });
      setScanOpen(false);
      await loadStats();
    } catch (err) {
      setScanResult({
        totals: { scanned: 0, drafted: 0, skipped: 0, errors: [] },
        error: (err as Error).message,
      });
    } finally {
      setScanning(false);
    }
  }

  // Rules visible in the scan dialog narrow to the chosen sub-account.
  const scanVisibleRules = useMemo(
    () => (scanSubChoice === ALL ? rules : rules.filter((r) => r.sub_account_id === scanSubChoice)),
    [rules, scanSubChoice]
  );

  const scopeLabel = (() => {
    const parts: string[] = [];
    if (subId) parts.push(subs.find((s) => s.id === subId)?.name || 'sub-account');
    if (ruleId) parts.push(rules.find((r) => r.id === ruleId)?.name || 'rule');
    return parts.length ? parts.join(' · ') : 'All sub-accounts · All rules';
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Scope: {scopeLabel}</p>
        </div>
        <Button onClick={openScanDialog} disabled={scanning}>
          {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
          Run scan now
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-4 pt-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sub-account</span>
            <Select value={subFilter} onValueChange={setSubFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sub-accounts</SelectItem>
                {subs.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rule</span>
            <Select value={ruleFilter} onValueChange={setRuleFilter}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All rules</SelectItem>
                {visibleRules.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <ScanResultBanner result={scanResult} onDismiss={() => setScanResult(null)} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Kpi
          title="Surfaced (7d)"
          value={kpis?.surfaced_7d ?? '—'}
          hint="Drafts created in the last 7 days"
        />
        <Kpi
          title="Surfaced (30d)"
          value={kpis?.surfaced_30d ?? '—'}
          hint="Drafts created in the last 30 days"
        />
        <Kpi
          title="Pending approval"
          value={kpis?.pending ?? '—'}
          hint="Drafts waiting for a human decision"
        />
        <Kpi
          title="Sent (30d)"
          value={kpis?.sent_30d ?? '—'}
          hint="Messages approved & delivered in the last 30 days"
        />
        <Kpi
          title="Reply rate (30d)"
          value={kpis ? `${kpis.reply_rate}%` : '—'}
          hint={kpis ? `${kpis.replied_30d} replies ÷ ${kpis.sent_30d} sent` : 'replies ÷ sent (same 30-day window)'}
        />
        <Kpi
          title="Positive-reply rate"
          value={kpis ? `${kpis.positive_reply_rate}%` : '—'}
          hint={kpis ? `${kpis.positive_30d} positive ÷ ${kpis.replied_30d} replies` : 'of replies, share classified positive'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity — last 90 days</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sends" stroke="#2563eb" dot={false} />
              <Line type="monotone" dataKey="replies" stroke="#16a34a" dot={false} />
              <Line type="monotone" dataKey="positive" stroke="#ee5622" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run scan</DialogTitle>
            <DialogDescription>
              Pick which sub-account and rule to scan. "All" means every active rule. New drafts land in that rule's queue. Contacts already drafted in the last 30 days are skipped.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Sub-account</Label>
              <Select value={scanSubChoice} onValueChange={setScanSubChoice}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sub-accounts</SelectItem>
                  {subs.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rule</Label>
              <Select value={scanRuleChoice} onValueChange={setScanRuleChoice}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All rules</SelectItem>
                  {scanVisibleRules.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}{!r.is_active ? ' (inactive)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScanOpen(false)} disabled={scanning}>Cancel</Button>
            <Button onClick={confirmScan} disabled={scanning}>
              {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Yes, scan now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Top rules by reply rate</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Replied</TableHead>
                <TableHead>Positive</TableHead>
                <TableHead>Reply rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perf.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No data yet.</TableCell>
                </TableRow>
              )}
              {perf.map((r) => (
                <TableRow key={r.rule_id}>
                  <TableCell className="font-medium">{r.rule_name}</TableCell>
                  <TableCell>{r.sent}</TableCell>
                  <TableCell>{r.replied}</TableCell>
                  <TableCell>{r.positive}</TableCell>
                  <TableCell>{r.reply_rate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ title, value, hint }: { title: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
        {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
