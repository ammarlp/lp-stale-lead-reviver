import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function Onboarding({ onComplete }: { onComplete?: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    ghl_location_id: '',
    ghl_api_key: '',
    brand_voice: '',
    timezone: 'UTC',
    recovery_stage_id: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.onboard({
        ...form,
        recovery_stage_id: form.recovery_stage_id || null,
        brand_voice: form.brand_voice || null,
      });
      onComplete?.();
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Welcome — let’s set up your account</CardTitle>
          <CardDescription>
            Connect your Launchpad sub-account. You can update these later in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Business name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Timezone</Label>
                <Input
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                />
              </div>
              <div>
                <Label>Launchpad Location ID</Label>
                <Input
                  value={form.ghl_location_id}
                  onChange={(e) => setForm({ ...form, ghl_location_id: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Launchpad API key</Label>
                <Input
                  type="password"
                  value={form.ghl_api_key}
                  onChange={(e) => setForm({ ...form, ghl_api_key: e.target.value })}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <Label>Brand voice (3–5 past messages, one per paragraph) — optional</Label>
                <Textarea
                  rows={5}
                  value={form.brand_voice}
                  onChange={(e) => setForm({ ...form, brand_voice: e.target.value })}
                  placeholder="Paste a few past messages your team has sent."
                />
              </div>
              <div className="md:col-span-2">
                <Label>Recovery pipeline stage ID — optional</Label>
                <Input
                  value={form.recovery_stage_id}
                  onChange={(e) => setForm({ ...form, recovery_stage_id: e.target.value })}
                />
              </div>
            </div>
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Finish setup
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
