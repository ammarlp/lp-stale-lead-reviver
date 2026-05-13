import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const emptyForm = {
  name: '',
  ghl_location_id: '',
  ghl_api_key: '',
  brand_voice: '',
  timezone: 'UTC',
  recovery_stage_id: '',
};

export default function Settings() {
  const [sub, setSub] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  async function load() {
    const [{ sub_account }, ai] = await Promise.all([api.getSubAccount(), api.aiStatus()]);
    setSub(sub_account);
    if (sub_account) {
      setForm({
        name: sub_account.name || '',
        ghl_location_id: sub_account.ghl_location_id || '',
        ghl_api_key: '', // never round-trip the key — only set if user retypes it
        brand_voice: sub_account.brand_voice || '',
        timezone: sub_account.timezone || 'UTC',
        recovery_stage_id: sub_account.recovery_stage_id || '',
      });
    }
    setAiStatus(ai);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function saveSub() {
    setSaving(true);
    setSavedMsg(null);
    try {
      // If editing and they didn't retype the API key, use the existing one server-side.
      // Since we never expose the key client-side, the user MUST retype to change/save it
      // on a fresh onboarding. For edits we leave the key field optional.
      const payload: any = { ...form, brand_voice: form.brand_voice || null, recovery_stage_id: form.recovery_stage_id || null };
      if (!form.ghl_api_key) {
        if (sub) delete payload.ghl_api_key; // keep the existing key
      }
      await api.saveSubAccount(payload);
      setSavedMsg('Saved.');
      setForm({ ...form, ghl_api_key: '' });
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
          <CardTitle>Sub-account</CardTitle>
          <CardDescription>
            Launchpad Location ID + API key. Keys are encrypted at rest.
            {sub && (
              <span className="ml-1 text-xs">
                Current key: <code>{sub.ghl_api_key}</code> — leave the field blank to keep it.
              </span>
            )}
          </CardDescription>
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
              <Label>Launchpad API key {sub && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}</Label>
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
            <Button
              onClick={saveSub}
              disabled={saving || !form.name || !form.ghl_location_id || (!sub && !form.ghl_api_key)}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save
            </Button>
            {savedMsg && <span className="text-xs text-muted-foreground">{savedMsg}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
