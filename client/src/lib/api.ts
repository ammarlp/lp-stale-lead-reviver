const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

async function call<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  health: () => call('/health'),

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
  listRules: (subId?: string) =>
    call<{ rules: any[] }>(`/rules${subId ? `?sub_account_id=${subId}` : ''}`),
  createRule: (body: any) => call('/rules', { method: 'POST', body: JSON.stringify(body) }),
  updateRule: (id: string, body: any) =>
    call(`/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRule: (id: string) => call(`/rules/${id}`, { method: 'DELETE' }),

  // settings
  listSubAccounts: () => call<{ sub_accounts: any[] }>('/settings/sub-accounts'),
  saveSubAccount: (body: any) =>
    call('/settings/sub-account', { method: 'POST', body: JSON.stringify(body) }),
  aiStatus: () =>
    call<{ connected: boolean; mode: string; message: string }>('/settings/ai-status'),
  aiTest: () => call<{ message: string; source: 'ai' | 'template' }>(
    '/settings/ai-test',
    { method: 'POST' }
  ),
  ghlPipelines: (subId: string) =>
    call<{ pipelines: any[] }>(`/settings/ghl/pipelines?sub_account_id=${subId}`),
  ghlWorkflows: (subId: string) =>
    call<{ workflows: any[] }>(`/settings/ghl/workflows?sub_account_id=${subId}`),
  pushDraftToWorkflow: (id: string, workflow_id: string) =>
    call(`/drafts/${id}/push-to-workflow`, { method: 'POST', body: JSON.stringify({ workflow_id }) }),

  // cron
  runScan: (body?: { sub_account_id?: string; rule_id?: string }) =>
    call('/cron/scan', { method: 'POST', body: JSON.stringify(body || {}) }),

  // dashboard
  kpis: (subId?: string, ruleId?: string) => {
    const q = new URLSearchParams();
    if (subId) q.set('sub_account_id', subId);
    if (ruleId) q.set('rule_id', ruleId);
    return call<any>(`/dashboard/kpis?${q.toString()}`);
  },
  timeseries: (subId?: string, ruleId?: string, days = 90) => {
    const q = new URLSearchParams({ days: String(days) });
    if (subId) q.set('sub_account_id', subId);
    if (ruleId) q.set('rule_id', ruleId);
    return call<{ series: any[] }>(`/dashboard/timeseries?${q.toString()}`);
  },
  rulePerformance: (subId?: string) =>
    call<{ rows: any[] }>(
      `/dashboard/rule-performance${subId ? `?sub_account_id=${subId}` : ''}`
    ),
};
