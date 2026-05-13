import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScanResultBanner, type ScanResultPayload } from '@/components/ScanResultBanner';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, relativeTime } from '@/lib/utils';
import { api } from '@/lib/api';
import { Check, Loader2, RefreshCw, Send, X, Sparkles, FileText, PlayCircle, Workflow } from 'lucide-react';

const ALL = '__all__';

export default function Queue() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [drafts, setDrafts] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [activeRuleId, setActiveRuleId] = useState<string>(searchParams.get('rule') || ALL);
  const [loading, setLoading] = useState(true);

  // Side panel + actions
  const [selected, setSelected] = useState<any | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editChannel, setEditChannel] = useState<'sms' | 'email'>('sms');
  const [working, setWorking] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Channel filter (kept from before)
  const [channelFilter, setChannelFilter] = useState<string>('all');

  // Scan confirm
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultPayload | null>(null);

  // Workflow picker — supports single or bulk
  const [wfOpen, setWfOpen] = useState(false);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [wfLoading, setWfLoading] = useState(false);
  const [chosenWorkflow, setChosenWorkflow] = useState<string>('');
  const [wfTargetIds, setWfTargetIds] = useState<string[]>([]);
  const [wfPushResult, setWfPushResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ drafts }, { rules }] = await Promise.all([
      api.listDrafts({ status: 'pending' }),
      api.listRules(),
    ]);
    setDrafts(drafts);
    setRules(rules);
    setLoading(false);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  // Keep ?rule= in sync so deep links work and refresh preserves the tab.
  useEffect(() => {
    const current = searchParams.get('rule') || ALL;
    if (current !== activeRuleId) {
      const next = new URLSearchParams(searchParams);
      if (activeRuleId === ALL) next.delete('rule');
      else next.set('rule', activeRuleId);
      setSearchParams(next, { replace: true });
    }
  }, [activeRuleId]);

  // If URL changes externally (e.g. dashboard "View queue" deep-link), follow it.
  useEffect(() => {
    const fromUrl = searchParams.get('rule') || ALL;
    if (fromUrl !== activeRuleId) setActiveRuleId(fromUrl);
  }, [searchParams]);

  // Counts per rule (only pending drafts)
  const ruleCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of drafts) {
      const k = d.rule_id || 'unassigned';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [drafts]);

  const filtered = useMemo(() => {
    return drafts.filter((d) => {
      if (activeRuleId !== ALL && d.rule_id !== activeRuleId) return false;
      if (channelFilter !== 'all' && d.channel !== channelFilter) return false;
      return true;
    });
  }, [drafts, activeRuleId, channelFilter]);

  const activeRule = rules.find((r) => r.id === activeRuleId);

  function openDraft(d: any) {
    setSelected(d);
    setEditBody(d.draft_message);
    setEditChannel(d.channel);
  }

  async function approveCurrent(save: boolean) {
    if (!selected) return;
    setWorking(true);
    try {
      if (save) {
        await api.updateDraft(selected.id, { draft_message: editBody, channel: editChannel, status: 'edited' });
      }
      await api.approveDraft(selected.id);
      setSelected(null);
      await load();
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setWorking(false);
    }
  }

  async function rejectCurrent() {
    if (!selected) return;
    setWorking(true);
    try {
      await api.rejectDraft(selected.id);
      setSelected(null);
      await load();
    } finally {
      setWorking(false);
    }
  }

  async function regenerateCurrent() {
    if (!selected) return;
    setWorking(true);
    try {
      const { draft }: any = await api.regenerateDraft(selected.id);
      setSelected(draft);
      setEditBody(draft.draft_message);
      await load();
    } finally {
      setWorking(false);
    }
  }

  async function bulkApprove() {
    const ids = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
    if (!ids.length) return;
    setWorking(true);
    try {
      await api.bulkApprove(ids);
      setChecked({});
      await load();
    } finally {
      setWorking(false);
    }
  }

  // -------- Scan --------
  function openScanDialog() {
    if (activeRuleId === ALL) {
      alert('Pick a rule tab first to scan into a specific queue.');
      return;
    }
    setScanOpen(true);
  }

  async function confirmScan() {
    if (activeRuleId === ALL) return;
    setScanning(true);
    setScanResult(null);
    try {
      const rule = rules.find((r) => r.id === activeRuleId);
      const r: any = await api.runScan({
        sub_account_id: rule?.sub_account_id,
        rule_id: activeRuleId,
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
      setScanResult({
        totals,
        ruleId: rule?.id,
        ruleName: rule?.name,
      });
      setScanOpen(false);
      await load();
    } catch (err) {
      setScanResult({
        totals: { scanned: 0, drafted: 0, skipped: 0, errors: [] },
        error: (err as Error).message,
      });
    } finally {
      setScanning(false);
    }
  }

  // -------- Push to workflow --------
  async function openWorkflowPicker(targetIds: string[]) {
    if (!targetIds.length) {
      alert('Pick at least one contact.');
      return;
    }
    // All targets must share the same sub-account so the workflow list matches.
    const targetDrafts = drafts.filter((d) => targetIds.includes(d.id));
    const subIds = new Set(targetDrafts.map((d) => d.sub_account_id));
    if (subIds.size > 1) {
      alert('Selected contacts span multiple sub-accounts. Push them in separate batches.');
      return;
    }
    const subAccountId = targetDrafts[0]?.sub_account_id;
    if (!subAccountId) return;

    setWfTargetIds(targetIds);
    setWfPushResult(null);
    setWfOpen(true);
    setWfLoading(true);
    setChosenWorkflow('');
    try {
      const r = await api.ghlWorkflows(subAccountId);
      setWorkflows(r.workflows || []);
    } catch (err) {
      alert(`Failed to load workflows: ${(err as Error).message}`);
      setWfOpen(false);
    } finally {
      setWfLoading(false);
    }
  }

  async function confirmPushToWorkflow() {
    if (!wfTargetIds.length || !chosenWorkflow) return;
    setWorking(true);
    setWfPushResult(null);
    let ok = 0;
    let fail = 0;
    const errors: string[] = [];
    for (const id of wfTargetIds) {
      try {
        await api.pushDraftToWorkflow(id, chosenWorkflow);
        ok++;
      } catch (err) {
        fail++;
        errors.push((err as Error).message);
      }
    }
    setWorking(false);
    if (fail === 0) {
      setWfOpen(false);
      alert(`${ok} contact${ok === 1 ? '' : 's'} added to workflow.`);
      setChecked({});
    } else {
      setWfPushResult(`${ok} succeeded, ${fail} failed. ${errors.slice(0, 2).join(' · ')}`);
    }
  }

  const selectedIds = useMemo(
    () => Object.entries(checked).filter(([, v]) => v).map(([k]) => k),
    [checked]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Approval queue</h1>
          <p className="text-sm text-muted-foreground">
            {activeRule ? `Queue: ${activeRule.name}` : 'All rules'} · {filtered.length} pending
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={openScanDialog} disabled={scanning || activeRuleId === ALL}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Scan into this queue
          </Button>
          <Button
            variant="secondary"
            onClick={bulkApprove}
            disabled={working || !selectedIds.length}
          >
            <Send className="mr-2 h-4 w-4" /> Approve selected ({selectedIds.length})
          </Button>
          <Button
            variant="outline"
            onClick={() => openWorkflowPicker(selectedIds)}
            disabled={working || !selectedIds.length}
          >
            <Workflow className="mr-2 h-4 w-4" /> Push selected to workflow
          </Button>
        </div>
      </div>

      {/* Per-rule tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        <RuleTab
          active={activeRuleId === ALL}
          onClick={() => setActiveRuleId(ALL)}
          label="All"
          count={drafts.length}
        />
        {rules.map((r) => (
          <RuleTab
            key={r.id}
            active={activeRuleId === r.id}
            onClick={() => setActiveRuleId(r.id)}
            label={r.name}
            count={ruleCounts.get(r.id) || 0}
            disabled={!r.is_active}
          />
        ))}
      </div>

      <ScanResultBanner result={scanResult} onDismiss={() => setScanResult(null)} />

      <Card>
        <CardContent className="flex flex-wrap gap-3 pt-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Channel</span>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  title="Select all in this queue"
                  ref={(el) => {
                    if (el) {
                      const total = filtered.length;
                      const sel = filtered.filter((d) => checked[d.id]).length;
                      el.indeterminate = sel > 0 && sel < total;
                    }
                  }}
                  checked={filtered.length > 0 && filtered.every((d) => checked[d.id])}
                  onChange={(e) => {
                    const next = { ...checked };
                    if (e.target.checked) {
                      for (const d of filtered) next[d.id] = true;
                    } else {
                      for (const d of filtered) delete next[d.id];
                    }
                    setChecked(next);
                  }}
                />
              </TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead className="w-12 text-right">Workflow</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No pending drafts in this queue. Click "Scan into this queue" to populate.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((d) => {
              const c = d.contact_snapshot || {};
              return (
                <TableRow key={d.id} onClick={() => openDraft(d)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!checked[d.id]}
                      onChange={(e) => setChecked((s) => ({ ...s, [d.id]: e.target.checked }))}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || c.phone || d.ghl_contact_id}
                  </TableCell>
                  <TableCell className="text-xs">{c.pipelineStageName || '—'}</TableCell>
                  <TableCell className="text-xs">{c.source || c.attributionSource || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{d.channel.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell>
                    {d.draft_source === 'ai' ? (
                      <Badge variant="success"><Sparkles className="mr-1 h-3 w-3" />AI</Badge>
                    ) : (
                      <Badge variant="warning"><FileText className="mr-1 h-3 w-3" />Template</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{relativeTime(c.lastActivity)}</TableCell>
                  <TableCell className="max-w-md truncate text-xs text-muted-foreground">{d.draft_message}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Push this contact to a GHL workflow"
                      onClick={() => openWorkflowPicker([d.id])}
                      disabled={working}
                    >
                      <Workflow className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Side panel */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          {selected && (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle>
                  {[selected.contact_snapshot?.firstName, selected.contact_snapshot?.lastName]
                    .filter(Boolean)
                    .join(' ') || 'Contact'}
                </SheetTitle>
                <SheetDescription>
                  {selected.draft_source === 'ai' ? (
                    <Badge variant="success"><Sparkles className="mr-1 h-3 w-3" />AI-drafted</Badge>
                  ) : (
                    <Badge variant="warning"><FileText className="mr-1 h-3 w-3" />Template — no AI key</Badge>
                  )}
                </SheetDescription>
              </SheetHeader>

              <ContactPanel snapshot={selected.contact_snapshot} />

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">History summary</div>
                <div className="rounded-md border bg-muted/40 p-3 text-sm">{selected.context_summary}</div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-medium text-muted-foreground">Draft message</div>
                  <Select value={editChannel} onValueChange={(v: any) => setEditChannel(v)}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="min-h-[180px] font-mono text-sm"
                />
                <div className="mt-1 text-xs text-muted-foreground">{editBody.length} chars</div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => approveCurrent(false)} disabled={working}>
                  <Check className="mr-2 h-4 w-4" /> Approve &amp; Send
                </Button>
                <Button variant="outline" onClick={() => approveCurrent(true)} disabled={working}>
                  <Send className="mr-2 h-4 w-4" /> Edit &amp; Send
                </Button>
                <Button variant="outline" onClick={regenerateCurrent} disabled={working}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
                </Button>
                <Button variant="outline" onClick={() => openWorkflowPicker([selected.id])} disabled={working}>
                  <Workflow className="mr-2 h-4 w-4" /> Push to workflow
                </Button>
                <Button variant="destructive" onClick={rejectCurrent} disabled={working}>
                  <X className="mr-2 h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Scan confirm dialog */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan into this queue?</DialogTitle>
            <DialogDescription>
              {activeRule ? (
                <>
                  This will run rule <strong>{activeRule.name}</strong> against the connected GHL sub-account
                  and add any qualifying dormant contacts as drafts in <em>this</em> queue.
                  Existing drafts for the same contacts within the last 30 days are skipped.
                </>
              ) : (
                'Pick a rule first.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScanOpen(false)} disabled={scanning}>Cancel</Button>
            <Button onClick={confirmScan} disabled={scanning}>
              {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Yes, scan now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workflow picker dialog (single + bulk) */}
      <Dialog open={wfOpen} onOpenChange={setWfOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Push {wfTargetIds.length} contact{wfTargetIds.length === 1 ? '' : 's'} to a GHL workflow
            </DialogTitle>
            <DialogDescription>
              Pick a workflow from this sub-account. Each contact will be added immediately. This is independent from approving the draft message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {wfLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading workflows...
              </div>
            ) : workflows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No workflows found. Make sure the Private Integration Token has the workflows scope, and the sub-account has at least one published workflow.
              </div>
            ) : (
              <Select value={chosenWorkflow} onValueChange={setChosenWorkflow}>
                <SelectTrigger><SelectValue placeholder="Pick a workflow..." /></SelectTrigger>
                <SelectContent>
                  {workflows.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} {w.status ? <span className="text-muted-foreground">({w.status})</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {wfPushResult && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                {wfPushResult}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWfOpen(false)} disabled={working}>Cancel</Button>
            <Button onClick={confirmPushToWorkflow} disabled={!chosenWorkflow || working}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Workflow className="mr-2 h-4 w-4" />}
              Push {wfTargetIds.length === 1 ? 'contact' : `${wfTargetIds.length} contacts`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleTab({
  active,
  onClick,
  label,
  count,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input hover:bg-accent',
        disabled && 'opacity-50'
      )}
    >
      {label}
      <span className={cn('ml-2 rounded-full px-1.5 py-0.5 text-xs', active ? 'bg-primary-foreground/20' : 'bg-muted')}>
        {count}
      </span>
    </button>
  );
}

function ContactPanel({ snapshot }: { snapshot: any }) {
  if (!snapshot) return null;
  const row = (k: string, v: any) =>
    v ? (
      <div className="flex justify-between border-b py-1 text-xs">
        <span className="text-muted-foreground">{k}</span>
        <span className="text-right">{String(v)}</span>
      </div>
    ) : null;
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs font-medium text-muted-foreground mb-1">Contact</div>
      {row('Email', snapshot.email)}
      {row('Phone', snapshot.phone)}
      {row('Stage', snapshot.pipelineStageName)}
      {row('Source', snapshot.source)}
      {row('Attribution', snapshot.attributionSource)}
      {row('Last activity', relativeTime(snapshot.lastActivity))}
      {row('Tags', (snapshot.tags || []).join(', '))}
    </div>
  );
}
