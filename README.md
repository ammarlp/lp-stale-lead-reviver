# Stale Lead Reviver

Automatically finds dormant CRM contacts in GoHighLevel, drafts personalized re-engagement messages (AI or template), and queues them for human approval before sending.

## Quick start

### 1. Supabase
1. Create a Supabase project.
2. In the SQL editor, run `supabase/schema.sql`.
3. Copy the project URL and service_role key.

### 2. Server
```bash
cd server
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, ENCRYPTION_KEY (32 bytes hex), GHL_WEBHOOK_SECRET
# OPENAI_API_KEY is optional — app falls back to templates if unset
npm install
npm run dev
```
Server runs on `http://localhost:4000`.

### 3. Client
```bash
cd client
cp .env.example .env
npm install
npm run dev
```
Client runs on `http://localhost:5173`.

### 4. Seed a sub-account
Either call the API:
```bash
curl -X POST http://localhost:4000/api/settings/sub-account \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Agency","ghl_location_id":"YOUR_LOCATION_ID","ghl_api_key":"YOUR_GHL_KEY","brand_voice":"","timezone":"UTC"}'
```
Or use the Settings page in the UI.

### 5. Create a rule
Use the Rules page (or POST `/api/rules`) — e.g. "90-day inactivity, all stages, auto channel".

### 6. Run the scan
Click "Run scan now" on the Dashboard, or `POST /api/cron/scan`. The cron is also scheduled daily at 08:00.

## AI fallback mode
The app works end-to-end without an OpenAI key. When the key is unset, drafts are built from a template and labeled **"Template — no AI key"** in the approval queue. Add a key in Settings to switch to GPT-4o personalized drafts labeled **"AI-drafted"**.

## Inbound webhook
Configure GHL to POST inbound messages to:
```
POST http://YOUR_HOST/api/webhook/ghl-inbound?secret=GHL_WEBHOOK_SECRET
```
The webhook classifies the reply (AI or keyword rules), updates the draft, and tags the contact in GHL.
