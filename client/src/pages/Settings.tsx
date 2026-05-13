import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function Settings() {
  const [subs, setSubs] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    name: '',
    ghl_location_id: '',
    ghl_api_key: '',
    brand_voice: '',
    timezone: 'UTC',
    recovery_stage_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  async function load() {
    const [{ sub_accounts }, ai] = await Promise.all([api.listSubAccounts(), api.aiStatus()]);
    setSubs(sub_accounts);
    setAiStatus(ai);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function saveSub() {
    setSaving(true);
    setSavedMsg(null);
    try {
      await api.saveSubAccount(form);
      setSavedMsg('Saved.');
      setForm({
        name: '',
        ghl_location_id: '',
        ghl_api_key: '',
        brand_voice: '',
        timezone: 'UTC',
        recovery_stage_id: '',
      });
      await load();
    } catch (err) {
      setSavedMsg(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function testAI() {
    setTesting(true);
    try {
      const r = await api.aiTest();
      setTestResult(r);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Connect Launchpad, configure brand voice, and optionally add an OpenAI key.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            OpenAI
            {aiStatus?.connected ? (
              <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" />Connected</Badge>
            ) : (
              <Badge variant="warning"><XCircle className="mr-1 h-3 w-3" />Not connected</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {aiStatus?.message || 'Checking...'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {aiStatus?.connected
              ? 'Drafts will be personalized with GPT-4o using each contact’s history and your brand voice samples.'
              : 'When unset, the app falls back to templates that clearly label each draft as "Template — no AI key". To connect, set OPENAI_API_KEY in the server .env and restart.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={testAI} disabled={testing}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Test draft
            </Button>
          </div>
          {testResult && (
            <div className="rounded-md border p-3">
              <div className="mb-1 text-xs">
                {testResult.source === 'ai' ? (
                  <Badge variant="success">AI-drafted</Badge>
                ) : (
                  <Badge variant="warning">Template — no AI key</Badge>
                )}
              </div>
              <pre className="whitespace-pre-wrap text-sm">{testResult.message}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add / update sub-account</CardTitle>
          <CardDescription>Launchpad Location ID + API key. Keys are encrypted at rest.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Timezone</Label>
              <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
            </div>
            <div>
              <Label>Launchpad Location ID</Label>
              <Input value={form.ghl_location_id} onChange={(e) => setForm({ ...form, ghl_location_id: e.target.value })} />
            </div>
            <div>
              <Label>Launchpad API key</Label>
              <Input
                type="password"
                value={form.ghl_api_key}
                onChange={(e) => setForm({ ...form, ghl_api_key: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Brand voice (3–5 past messages, one per paragraph)</Label>
              <Textarea
                rows={6}
                value={form.brand_voice}
                onChange={(e) => setForm({ ...form, brand_voice: e.target.value })}
                placeholder="Paste a few past messages the team has sent. Used as few-shot priming when AI is on."
              />
            </div>
            <div className="md:col-span-2">
              <Label>Recovery pipeline stage ID (optional — where positive replies get moved)</Label>
              <Input
                value={form.recovery_stage_id}
                onChange={(e) => setForm({ ...form, recovery_stage_id: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={saveSub} disabled={saving || !form.name || !form.ghl_location_id || !form.ghl_api_key}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save
            </Button>
            {savedMsg && <span className="text-xs text-muted-foreground">{savedMsg}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected sub-accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {subs.length === 0 && <div className="text-sm text-muted-foreground">None connected yet.</div>}
          <div className="space-y-2">
            {subs.map((s) => (
              <div key={s.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  Location: {s.ghl_location_id} · Timezone: {s.timezone} · Key: {s.ghl_api_key}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
