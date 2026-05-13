import { sb, listSubAccounts, getSubAccount } from '../services/supabase';
import { GhlClient, epochToDate, relativeFromEpoch } from '../services/ghl';
import { draftMessage, summarizeHistory } from '../services/ai';
import type { ContactSnapshot, ReviveRule, SubAccount } from '../types';

export interface ScanResult {
  subAccountId: string;
  scanned: number;
  drafted: number;
  skipped: number;
  errors: string[];
}

export async function runScan(options: { subAccountId?: string; ruleId?: string } = {}): Promise<ScanResult[]> {
  const subs = options.subAccountId
    ? [await getSubAccount(options.subAccountId)].filter(Boolean) as SubAccount[]
    : await listSubAccounts();

  const results: ScanResult[] = [];
  for (const sub of subs) {
    const result: ScanResult = { subAccountId: sub.id, scanned: 0, drafted: 0, skipped: 0, errors: [] };
    try {
      const rulesQuery = sb()
        .from('revive_rules')
        .select('*')
        .eq('sub_account_id', sub.id)
        .eq('is_active', true);
      if (options.ruleId) rulesQuery.eq('id', options.ruleId);
      const { data: rules, error } = await rulesQuery;
      if (error) throw error;

      for (const rule of (rules || []) as ReviveRule[]) {
        await scanRule(sub, rule, result);
      }
    } catch (err) {
      result.errors.push((err as Error).message);
    }
    results.push(result);
  }
  return results;
}

async function scanRule(sub: SubAccount, rule: ReviveRule, result: ScanResult): Promise<void> {
  const ghl = new GhlClient(sub.ghl_api_key, sub.ghl_location_id);
  const cutoff = Date.now() - rule.inactivity_days * 86_400_000;

  // Load pipeline stage name map once
  let stageIdToName = new Map<string, string>();
  try {
    const pipelines = await ghl.listPipelines();
    for (const p of pipelines?.pipelines || []) {
      for (const s of p.stages || []) stageIdToName.set(s.id, `${p.name} / ${s.name}`);
    }
  } catch (e) {
    result.errors.push(`pipelines: ${(e as Error).message}`);
  }

  let startAfterId: string | undefined;
  let safetyLoops = 0;
  while (safetyLoops++ < 20) {
    const page = await ghl.searchContacts({ limit: 100, startAfterId });
    const contacts: any[] = page?.contacts || [];
    if (!contacts.length) break;

    for (const c of contacts) {
      result.scanned++;
      try {
        // Convert lastActivity (may be string/number epoch ms)
        const last = c.lastActivity ? Number(c.lastActivity) : c.dateUpdated ? Date.parse(c.dateUpdated) : 0;
        if (!last || last > cutoff) {
          result.skipped++;
          continue;
        }

        // Tag filters
        const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
        if (rule.include_tags?.length && !rule.include_tags.some((t) => tags.includes(t))) {
          result.skipped++;
          continue;
        }
        if (rule.exclude_tags?.length && rule.exclude_tags.some((t) => tags.includes(t))) {
          result.skipped++;
          continue;
        }

        // Activity-source filter (matches against `source`, attributionSource.*, lastAttributionSource.*)
        if ((rule as any).activity_sources?.length) {
          const sources = [
            c.source,
            c.attributionSource?.source,
            c.attributionSource?.sessionSource,
            c.attributionSource?.medium,
            c.lastAttributionSource?.source,
            c.lastAttributionSource?.sessionSource,
            c.lastAttributionSource?.medium,
          ]
            .filter(Boolean)
            .map((s: any) => String(s).toLowerCase());
          const allowed = (rule as any).activity_sources.map((s: string) => s.toLowerCase());
          const match = sources.some((cs) => allowed.some((a: string) => cs.includes(a)));
          if (!match) {
            result.skipped++;
            continue;
          }
        }

        // Already drafted recently?
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const { data: existing } = await sb()
          .from('drafts')
          .select('id,status,created_at')
          .eq('ghl_contact_id', c.id)
          .in('status', ['pending', 'approved', 'sent'])
          .gte('created_at', thirtyDaysAgo)
          .limit(1);
        if (existing && existing.length) {
          result.skipped++;
          continue;
        }

        // Fetch opportunities and pipeline stage
        let pipelineStageId: string | undefined;
        let pipelineStageName: string | undefined;
        try {
          const opps = await ghl.searchOpportunitiesByContact(c.id);
          const op = (opps?.opportunities || [])[0];
          if (op) {
            pipelineStageId = op.pipelineStageId; // NOTE: pipelineStageId, NOT stageId
            pipelineStageName = stageIdToName.get(op.pipelineStageId);
          }
        } catch (e) {
          // non-fatal
        }

        if (rule.pipeline_stage_ids?.length && (!pipelineStageId || !rule.pipeline_stage_ids.includes(pipelineStageId))) {
          result.skipped++;
          continue;
        }

        // Custom fields (id → value) mapped to name
        const customFields: Record<string, unknown> = {};
        try {
          const cfRes = await ghl.getContactCustomFields(c.id);
          const defs = await ghl.listCustomFieldDefs();
          const idToName = new Map<string, string>();
          for (const d of defs?.customFields || []) idToName.set(d.id, d.name);
          for (const f of cfRes?.customFields || []) {
            const name = idToName.get(f.id) || f.id;
            customFields[name] = f.value;
          }
        } catch { /* non-fatal */ }

        // Last 5 conversations
        let conversations: any[] = [];
        try {
          const cs = await ghl.searchConversations(c.id, 5);
          conversations = cs?.conversations || [];
        } catch { /* non-fatal */ }

        const lastActivityRelative = relativeFromEpoch(last);

        const contextSummary = await summarizeHistory({
          contact: c,
          conversations,
          pipelineStageName,
          tags,
          lastActivityRelative,
        });

        const channel: 'sms' | 'email' =
          rule.channel === 'auto' ? (c.phone ? 'sms' : 'email') : rule.channel;

        const snapshot: ContactSnapshot = {
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          tags,
          lastActivity: last,
          pipelineStageId,
          pipelineStageName,
          customFields,
          source: c.source,
          attributionSource:
            c.attributionSource?.source ||
            c.attributionSource?.sessionSource ||
            c.lastAttributionSource?.source ||
            c.lastAttributionSource?.sessionSource ||
            null,
        } as any;

        const { message, source } = await draftMessage({
          contact: snapshot,
          channel,
          pipelineStageName,
          contextSummary,
          lastActivityRelative,
          tags,
          brandVoice: sub.brand_voice,
          businessName: sub.name,
        });

        const { error: insErr } = await sb().from('drafts').insert({
          sub_account_id: sub.id,
          rule_id: rule.id,
          ghl_contact_id: c.id,
          contact_snapshot: snapshot,
          context_summary: contextSummary,
          channel,
          draft_message: message,
          draft_source: source,
          status: 'pending',
        });
        if (insErr) throw insErr;

        result.drafted++;
      } catch (err) {
        result.errors.push(`contact ${c.id}: ${(err as Error).message}`);
      }
    }

    startAfterId = contacts[contacts.length - 1]?.id;
    if (!startAfterId || contacts.length < 100) break;
  }
}
