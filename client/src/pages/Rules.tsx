import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { Plus, Trash2, Pencil } from 'lucide-react';

interface Rule {
  id: string;
  name: string;
  inactivity_days: number;
  pipeline_stage_ids: string[] | null;
  include_tags: string[] | null;
  exclude_tags: string[] | null;
  activity_sources: string[] | null;
  channel: 'sms' | 'email' | 'auto';
  is_active: boolean;
}

export default function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);

  async function load() {
    const { rules } = await api.listRules();
    setRules(rules);
    try {
      const r = await api.ghlPipelines();
      setPipelines(r.pipelines || []);
    } catch { /* non-fatal — may not have Launchpad creds yet */ }
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  function newRule() {
    setEditing({
      name: '',
      inactivity_days: 90,
      channel: 'auto',
      is_active: true,
      pipeline_stage_ids: [],
      include_tags: [],
      exclude_tags: [],
      activity_sources: [],
    });
  }

  async function save() {
    if (!editing) return;
    const payload: any = {
      name: editing.name,
      inactivity_days: Number(editing.inactivity_days),
      channel: editing.channel,
      is_active: editing.is_active,
      pipeline_stage_ids: editing.pipeline_stage_ids?.length ? editing.pipeline_stage_ids : null,
      include_tags: editing.include_tags?.length ? editing.include_tags : null,
      exclude_tags: editing.exclude_tags?.length ? editing.exclude_tags : null,
      activity_sources: editing.activity_sources?.length ? editing.activity_sources : null,
    };
    if (editing.id) await api.updateRule(editing.id, payload);
    else await api.createRule(payload);
    setEditing(null);
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this rule?')) return;
    await api.deleteRule(id);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Revive rules</h1>
          <p className="text-sm text-muted-foreground">Which dormant contacts should we surface?</p>
        </div>
        <Button onClick={newRule}>
          <Plus className="mr-2 h-4 w-4" /> New rule
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Inactivity</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Stages</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id} onClick={() => setEditing(r)}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.inactivity_days} days</TableCell>
                <TableCell><Badge variant="outline">{r.channel}</Badge></TableCell>
                <TableCell className="text-xs">{r.pipeline_stage_ids?.length || 'All'}</TableCell>
                <TableCell className="text-xs">
                  {(r.include_tags?.length || 0) + (r.exclude_tags?.length || 0) || '—'}
                </TableCell>
                <TableCell>{r.is_active ? <Badge variant="success">On</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent>
          {editing && (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle>{editing.id ? 'Edit rule' : 'New rule'}</SheetTitle>
              </SheetHeader>

              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>

                <div>
                  <Label>Inactivity days</Label>
                  <Input
                    type="number"
                    value={editing.inactivity_days ?? 90}
                    onChange={(e) => setEditing({ ...editing, inactivity_days: Number(e.target.value) })}
                  />
                </div>

                <div>
                  <Label>Channel</Label>
                  <Select
                    value={editing.channel || 'auto'}
                    onValueChange={(v: any) => setEditing({ ...editing, channel: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (SMS if phone, else email)</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Pipeline stages (comma-separated IDs, blank = all)</Label>
                  <Input
                    value={(editing.pipeline_stage_ids || []).join(',')}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        pipeline_stage_ids: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                  {pipelines.length > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Known stages:{' '}
                      {pipelines
                        .flatMap((p: any) =>
                          (p.stages || []).map((s: any) => `${p.name} / ${s.name} = ${s.id}`)
                        )
                        .slice(0, 6)
                        .join(' · ')}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Include tags (comma-separated)</Label>
                  <Input
                    value={(editing.include_tags || []).join(',')}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        include_tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </div>

                <div>
                  <Label>Exclude tags (comma-separated)</Label>
                  <Input
                    value={(editing.exclude_tags || []).join(',')}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        exclude_tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </div>

                <div>
                  <Label>Activity sources (comma-separated, partial match)</Label>
                  <Input
                    placeholder="e.g. CRM UI, LinkedIn, Form, Webinar"
                    value={(editing.activity_sources || []).join(',')}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        activity_sources: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                  <div className="mt-1 text-xs text-muted-foreground">
                    Filters by contact's <code>source</code> + first/last attribution source. Case-insensitive substring match. Blank = no filter.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!editing.is_active}
                    onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                  />
                  <Label>Active</Label>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={save} disabled={!editing.name}>Save</Button>
                  <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
