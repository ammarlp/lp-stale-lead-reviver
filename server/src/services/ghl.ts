import { request } from 'undici';

const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

export class GhlClient {
  constructor(private apiKey: string, private locationId: string) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Version: VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private async call<T = any>(method: string, path: string, body?: any, query?: Record<string, any>): Promise<T> {
    const url = new URL(BASE + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v == null) continue;
        if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
        else url.searchParams.set(k, String(v));
      }
    }
    const res = await request(url.toString(), {
      method: method as any,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.body.text();
    if (res.statusCode >= 400) {
      throw new Error(`GHL ${method} ${path} → ${res.statusCode}: ${text}`);
    }
    try {
      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      return text as unknown as T;
    }
  }

  // --- Contacts ---
  async searchContacts(opts: { limit?: number; startAfterId?: string; query?: string } = {}) {
    // GHL v2 search endpoint
    return this.call<any>('POST', '/contacts/search', {
      locationId: this.locationId,
      pageLimit: opts.limit ?? 100,
      ...(opts.startAfterId ? { startAfterId: opts.startAfterId } : {}),
      ...(opts.query ? { query: opts.query } : {}),
    });
  }

  async getContact(contactId: string) {
    return this.call<any>('GET', `/contacts/${contactId}`);
  }

  async getContactCustomFields(contactId: string) {
    return this.call<any>('GET', `/contacts/${contactId}/customFields`);
  }

  async listCustomFieldDefs() {
    return this.call<any>('GET', `/locations/${this.locationId}/customFields`);
  }

  async addTag(contactId: string, tags: string[]) {
    return this.call<any>('POST', `/contacts/${contactId}/tags`, { tags });
  }

  async updateContact(contactId: string, body: Record<string, any>) {
    return this.call<any>('PUT', `/contacts/${contactId}`, body);
  }

  // --- Conversations ---
  async searchConversations(contactId: string, limit = 5) {
    return this.call<any>('GET', '/conversations/search', undefined, {
      locationId: this.locationId,
      contactId,
      limit,
    });
  }

  async listConversationMessages(conversationId: string, limit = 20) {
    return this.call<any>('GET', `/conversations/${conversationId}/messages`, undefined, { limit });
  }

  async sendMessage(body: {
    type: 'SMS' | 'Email';
    contactId: string;
    message?: string;
    html?: string;
    subject?: string;
  }) {
    return this.call<any>('POST', '/conversations/messages', body);
  }

  // --- Pipelines / Opportunities ---
  async listPipelines() {
    return this.call<any>('GET', '/opportunities/pipelines', undefined, { locationId: this.locationId });
  }

  async searchOpportunitiesByContact(contactId: string) {
    return this.call<any>('GET', '/opportunities/search', undefined, {
      location_id: this.locationId,
      contact_id: contactId,
    });
  }

  async updateOpportunity(id: string, body: Record<string, any>) {
    return this.call<any>('PUT', `/opportunities/${id}`, body);
  }

  // --- Workflows ---
  async listWorkflows() {
    return this.call<any>('GET', '/workflows/', undefined, { locationId: this.locationId });
  }

  async addContactToWorkflow(contactId: string, workflowId: string) {
    return this.call<any>('POST', `/contacts/${contactId}/workflow/${workflowId}`);
  }
}

// Convert epoch-ms to ISO / relative strings. GHL returns timestamps as epoch-ms.
export function epochToDate(ms?: number | string | null): Date | null {
  if (ms == null) return null;
  const n = typeof ms === 'string' ? Number(ms) : ms;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n);
}

export function relativeFromEpoch(ms?: number | string | null): string {
  const d = epochToDate(ms);
  if (!d) return 'unknown';
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
