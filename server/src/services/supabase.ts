import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from './crypto';
import type { SubAccount } from '../types';

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function getSubAccount(id: string): Promise<SubAccount | null> {
  const { data, error } = await sb().from('sub_accounts').select('*').eq('id', id).single();
  if (error || !data) return null;
  return { ...data, ghl_api_key: decrypt(data.ghl_api_key) };
}

export async function getSubAccountByLocation(locationId: string): Promise<SubAccount | null> {
  const { data, error } = await sb().from('sub_accounts').select('*').eq('ghl_location_id', locationId).single();
  if (error || !data) return null;
  return { ...data, ghl_api_key: decrypt(data.ghl_api_key) };
}

export async function listSubAccounts(): Promise<SubAccount[]> {
  const { data, error } = await sb().from('sub_accounts').select('*').order('created_at');
  if (error) throw error;
  return (data || []).map((d: any) => ({ ...d, ghl_api_key: decrypt(d.ghl_api_key) }));
}

export async function upsertSubAccount(input: {
  id?: string;
  name: string;
  ghl_location_id: string;
  ghl_api_key: string;
  brand_voice?: string | null;
  timezone?: string;
  recovery_stage_id?: string | null;
}): Promise<SubAccount> {
  const row = {
    ...input,
    ghl_api_key: encrypt(input.ghl_api_key),
  };
  const { data, error } = await sb().from('sub_accounts').upsert(row, { onConflict: 'ghl_location_id' }).select().single();
  if (error) throw error;
  return { ...data, ghl_api_key: decrypt(data.ghl_api_key) };
}
