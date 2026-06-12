import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T = any>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(BASE + path, { ...init, headers });

  if (res.status === 401) {
    await supabase.auth.signOut();
    // Let the auth-aware router redirect to /login on next render.
    throw new ApiError('Session expired — please sign in again.', 401);
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(body?.error || `HTTP ${res.status}`, res.status);
  return body as T;
}

export const api = {
  health: () => call('/health'),

  // onboarding
  onboard: (body: any) =>
    call('/onboarding', { method: 'POST', body: JSON.stringify(body) }),

  // drafts
  listDrafts: (params: Record<string, string | undefined> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return call<{ drafts: any[] }>(`/drafts?${q.toString()}`);
  },
  getDraft: (id: string) => call<{ draft: any; events: any[] }>(`/drafts/${id}`),
  updateDraft: (id: string, patch: any) =>
    call(`/drafts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  approveDraft: (id: string) => call(`/drafts/${id}/approve`, { method: 'POST' }),
  rejectDraft: (id: string) => call(`/drafts/${id}/reject`, { method: 'POST' }),
  regenerateDraft: (id: string) => call(`/drafts/${id}/regenerate`, { method: 'POST' }),
  bulkApprove: (ids: string[]) =>
    call('/drafts/bulk-approve', { method: 'POST', body: JSON.stringify({ ids }) }),

  // rules
  listRules: () => call<{ rules: any[] }>('/rules'),
  createRule: (body: any) => call('/rules', { method: 'POST', body: JSON.stringify(body) }),
  updateRule: (id: string, body: any) =>
    call(`/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRule: (id: string) => call(`/rules/${id}`, { method: 'DELETE' }),

  // settings
  getSubAccount: () => call<{ sub_account: any | null }>('/settings/sub-account'),
  saveSubAccount: (body: any) =>
    call('/settings/sub-account', { method: 'POST', body: JSON.stringify(body) }),
  aiStatus: () =>
    call<{ connected: boolean; mode: string; message: string }>('/settings/ai-status'),
  aiTest: () => call<{ message: string; source: 'ai' | 'template' }>(
    '/settings/ai-test',
    { method: 'POST' }
  ),
  ghlPipelines: () => call<{ pipelines: any[] }>('/settings/ghl/pipelines'),
  ghlWorkflows: () => call<{ workflows: any[] }>('/settings/ghl/workflows'),
  pushDraftToWorkflow: (id: string, workflow_id: string) =>
    call(`/drafts/${id}/push-to-workflow`, { method: 'POST', body: JSON.stringify({ workflow_id }) }),

  // cron
  runScan: (body?: { rule_id?: string }) =>
    call('/cron/scan', { method: 'POST', body: JSON.stringify(body || {}) }),
  checkReplies: () =>
    call<{ ok: boolean; results: Array<{ subAccountId: string; checked: number; replied: number; errors: string[] }> }>(
      '/cron/check-replies',
      { method: 'POST' }
    ),

  // dashboard
  kpis: (ruleId?: string) => {
    const q = new URLSearchParams();
    if (ruleId) q.set('rule_id', ruleId);
    return call<any>(`/dashboard/kpis?${q.toString()}`);
  },
  timeseries: (ruleId?: string, days = 90) => {
    const q = new URLSearchParams({ days: String(days) });
    if (ruleId) q.set('rule_id', ruleId);
    return call<{ series: any[] }>(`/dashboard/timeseries?${q.toString()}`);
  },
  rulePerformance: () =>
    call<{ rows: any[] }>('/dashboard/rule-performance'),
};
