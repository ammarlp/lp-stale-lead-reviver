# SOP — Deploying a Node.js app to js.launchpadinnovations.ai

This is the standard playbook for anyone at Launchpad Innovations who needs to deploy a Node.js app to the shared VPS. Read this **before** writing code, because the architecture imposes a few constraints your app needs to satisfy.

> Last updated: 2026-05-14 · Owner: Ammar

---

## 📌 Port allocation — claimed vs available

**Every app on this VPS runs on a unique localhost port. Before deploying, claim the next available port and update this table in the same PR.**

| Port | App | Path on domain | PM2 name | Owner |
|------|-----|----------------|----------|-------|
| 3000 | stale-lead-reviver | `/lead-reviver` | `launchpad-js` | Ammar |
| 3001 | review-aggregator | `/review-aggregator` | `review-aggregator` | Ammar |
| 3002 | _available_ | | | |
| 3003 | _available_ | | | |
| 3004 | _available_ | | | |
| 3005 | _available_ | | | |

**Rule:** Never reuse a port. Never deploy without claiming one.

---

## 🏗 The architecture in one paragraph

The VPS is a Hostinger KVM2 box running CloudPanel. There's a single domain — **js.launchpadinnovations.ai** — and every app lives under its own path prefix (`/lead-reviver`, `/review-aggregator`, etc.). Nginx (managed by CloudPanel) routes each prefix to a different localhost port. Each app is **one Node process** managed by PM2 that serves both its API and its built frontend statically. The Node process must be **path-aware** — it has to know it's mounted at `/your-app-name` so its routes and asset URLs include that prefix.

```
Browser → https://js.launchpadinnovations.ai/<your-app>/...
            │
            ▼
        Nginx (CloudPanel vhost)
            │  location /<your-app>/ → proxy_pass http://127.0.0.1:<your-port>
            ▼
        PM2 process (Node, on <your-port>)
            ├── serves /<your-app>/api/*  →  Express routes
            └── serves /<your-app>/*       →  built frontend (static files)
```

---

## ✅ Pre-deploy checklist — your app MUST satisfy these

Before you ask anyone to deploy your app, confirm:

- [ ] Your app is one Node process. (Not separate frontend + backend processes — wrap them in one Express server.)
- [ ] It reads `PORT` from env and listens on it.
- [ ] It is **path-aware**: every route and asset URL is prefixed with `/<your-app-name>`.
- [ ] If it has a frontend, the built static files are served by the SAME Express process at `/<your-app-name>/...`.
- [ ] You have an SPA fallback so `GET /<your-app-name>/anything` returns `index.html` for client-side routing.
- [ ] You've claimed a port in the table above.
- [ ] The repo has a `README.md` with the redeploy steps (copy the template from [stale-lead-reviver/README.md](README.md) or [review-aggregator/README.md](https://github.com/<owner>/review-aggregator/blob/main/README.md)).
- [ ] You have a `.gitignore` that excludes `.env`, `node_modules`, `dist`, `*.tsbuildinfo`, `logs/`.
- [ ] You have an `ecosystem.config.cjs` (PM2 config) at the repo root — example below.
- [ ] You have a `.env.example` listing every env var your app needs.

If any box is unchecked, fix it before going further.

---

## 🚀 First-time deploy (new app)

### Step 1 — On your local machine

1. Make sure your code satisfies the checklist above.
2. Push to a **private GitHub repo**.

### Step 2 — On the VPS (SSH as root)

```bash
ssh root@YOUR_VPS_IP
cd /home/launchpadinnovations-js/htdocs/js.launchpadinnovations.ai/
```

### Step 3 — Clone your repo (use a `lp-<name>` folder to avoid collisions)

```bash
git clone https://github.com/<owner>/<your-app>.git lp-<your-app>
cd lp-<your-app>
```

### Step 4 — Create the production .env

```bash
nano .env       # or wherever your app expects it (e.g. server/.env)
```

Paste your production env values — your real DB/API keys, etc. **Never commit this file.** Refer to your `.env.example` for the variable names.

### Step 5 — Install deps + build

| Stack | Commands |
|---|---|
| npm | `npm install && npm run build` |
| pnpm | `pnpm install --ignore-scripts && pnpm run build` |
| yarn | `yarn install && yarn build` |

If your app needs env vars at **build** time (Vite apps usually do — `BASE_PATH`, etc.), prefix them inline:

```bash
PORT=<your-port> BASE_PATH=/<your-app> pnpm run build
```

### Step 6 — Start under PM2

```bash
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
```

If this is the **very first** PM2 process on the box, also run `pm2 startup` and follow its instructions to enable boot persistence. (It's already been done — you only need to do it once per VPS, ever.)

### Step 7 — Verify the app is alive on its port

```bash
pm2 status                # your app should show "online"
curl http://localhost:<your-port>/<your-app>/api/health   # or whatever your health route is
```

### Step 8 — Wire up Nginx (CloudPanel)

1. Log in to CloudPanel
2. Click the site **js.launchpadinnovations.ai**
3. Open the **Vhost** tab
4. Find the `location /` block near the bottom. **Above it**, add:

```nginx
location /<your-app>/ {
    proxy_pass http://127.0.0.1:<your-port>;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

⚠️ Three details that trip people up:
- **No trailing slash** on `proxy_pass http://127.0.0.1:<port>;` — that's what preserves the `/<your-app>` prefix when forwarding
- Goes **before** the catch-all `location /` block
- Click **Save** — CloudPanel reloads Nginx automatically

### Step 9 — Verify in browser

Open **https://js.launchpadinnovations.ai/<your-app>/** in an incognito window. Your app should load.

### Step 10 — Update this SOP

Add a row to the port allocation table at the top and commit it back to the [stale-lead-reviver](https://github.com/<owner>/stale-lead-reviver) repo (or wherever this doc lives).

---

## ♻️ Subsequent deploys (every time you push code changes)

This is the common case. After Step 1–10 above are done once, every future deploy is just:

```bash
# Your local machine
git add .
git commit -m "what you changed"
git push

# On the VPS
ssh root@YOUR_VPS_IP
cd /home/launchpadinnovations-js/htdocs/js.launchpadinnovations.ai/lp-<your-app>
git pull
<install command>     # npm install / pnpm install --ignore-scripts / etc.
<build command>       # see Step 5 above; include env vars if needed
pm2 restart <pm2-name>
```

Verify with `curl http://localhost:<your-port>/<your-app>/api/health` (or whatever the health route is) and a hard-refresh in incognito.

---

## 📄 Required files in your repo

### `ecosystem.config.cjs` (at repo root)

```js
module.exports = {
  apps: [
    {
      name: '<your-pm2-name>',
      script: 'path/to/your/built-server.js',  // e.g. dist/index.js or artifacts/api-server/dist/index.mjs
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: <your-port>,
        // any other env vars your app needs at runtime
      },
      max_memory_restart: '512M',
      out_file: 'logs/out.log',
      error_file: 'logs/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
```

### Path-aware Express snippet (for reference)

If your backend is Express, your app entrypoint should look something like:

```ts
import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
const BASE_PATH = '/<your-app>';   // matches the URL prefix

// API routes
app.use(`${BASE_PATH}/api`, apiRouter);

// Static frontend + SPA fallback
const clientDist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(BASE_PATH, express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (!req.path.startsWith(BASE_PATH)) return next();
    if (req.path.startsWith(`${BASE_PATH}/api`)) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const port = Number(process.env.PORT);
app.listen(port);
```

### Vite config (for React frontends)

```ts
export default defineConfig({
  base: '/<your-app>/',     // must match BASE_PATH on the backend
  // ... rest of your config
});
```

For React Router: `<BrowserRouter basename="/<your-app>">`.

---

## 🔥 Common pitfalls

| Symptom | Likely cause |
|---|---|
| Browser shows lead-reviver / wrong app instead of yours | Nginx location block missing or placed AFTER `location /`. Re-check Vhost in CloudPanel. |
| "Cannot GET /your-app/..." (Express 404) | Nginx is sending traffic to the wrong port. Verify with `nginx -T \| grep your-app`. |
| Blank page in browser, 404s for `/assets/x.js` | Your frontend's asset URLs aren't prefixed. Fix Vite `base` or equivalent. |
| API calls 404 from the frontend | Frontend is calling `/api/...` instead of `/your-app/api/...`. Fix the API base in the frontend. |
| App crashes on start: "DATABASE_URL not set" | Your `.env` is missing or in the wrong location. Confirm with `cat /home/.../lp-your-app/.env`. |
| Pages still show old version after deploy | Browser cache. Hard-refresh (Ctrl+Shift+R) or use incognito. |
| `pm2 restart` doesn't pick up new env values | The .env got edited but PM2 carries forward the original env. The Node process re-reads .env on restart **only if your code uses `dotenv.config()`**. Otherwise use `pm2 restart --update-env`. |

---

## 🆘 Who to ask

- **Architecture / new ports / Nginx changes** → Ammar
- **CloudPanel / VPS-level access** → Ammar
- **App-specific issues** → owner listed in the port table

If you accidentally break the Nginx config and the site goes down, revert via CloudPanel → Vhost (it keeps the previous template). If that fails:

```bash
# On the VPS, the live config is here:
nano /etc/nginx/sites-enabled/js.launchpadinnovations.ai.conf
# Fix or revert, then:
nginx -t && systemctl reload nginx
```

---

## Appendix — what's already installed on the VPS

- Node.js 22 (LTS)
- npm 10.x
- pnpm 11.x
- PM2 7.x (with `pm2 startup` configured for boot persistence)
- Git
- CloudPanel (Nginx managed via the Vhost tab)

If your app needs Node 24 / Python / Redis / etc., flag it before deploying — installing system packages on a shared VPS needs coordination.
