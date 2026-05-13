export interface SubAccount {
  id: string;
  ghl_location_id: string;
  ghl_api_key: string; // encrypted in DB; decrypted when fetched via getSubAccount
  name: string;
  brand_voice: string | null;
  timezone: string;
  recovery_stage_id: string | null;
  created_at: string;
}

export interface ReviveRule {
  id: string;
  sub_account_id: string;
  name: string;
  inactivity_days: number;
  pipeline_stage_ids: string[] | null;
  include_tags: string[] | null;
  exclude_tags: string[] | null;
  channel: 'sms' | 'email' | 'auto';
  is_active: boolean;
  created_at: string;
}

export interface ContactSnapshot {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  lastActivity?: number; // epoch ms
  pipelineStageId?: string;
  pipelineStageName?: string;
  customFields?: Record<string, unknown>;
}

export interface DraftContext {
  contact: ContactSnapshot;
  channel: 'sms' | 'email';
  pipelineStageName?: string;
  contextSummary: string;
  lastActivityRelative: string;
  tags: string[];
  brandVoice?: string | null;
  businessName: string;
}

export interface Draft {
  id: string;
  sub_account_id: string;
  rule_id: string | null;
  ghl_contact_id: string;
  contact_snapshot: ContactSnapshot;
  context_summary: string;
  channel: 'sms' | 'email';
  draft_message: string;
  draft_source: 'ai' | 'template';
  status: 'pending' | 'approved' | 'edited' | 'rejected' | 'sent' | 'replied';
  approved_by: string | null;
  sent_at: string | null;
  reply_sentiment: string | null;
  created_at: string;
}
