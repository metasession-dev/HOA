# Railway deployment — operator runbook

This is the end-to-end runbook for standing up HOA.africa on Railway in
project `d436a63d-be9f-49dc-92a7-fd3215684a5f`. It pairs with
`scripts/setup-railway.sh`, which bootstraps every env var the script
can generate or wire by reference. Anything API-key-shaped you supply
manually at the end.

The platform is four apps + two managed addons:

| Service          | Repo                       | Build/Runtime               | Public hostname                                            |
| ---------------- | -------------------------- | --------------------------- | ---------------------------------------------------------- |
| `hoa-api`        | HOA-API                    | NestJS (NIXPACKS → node)    | `<auto>.up.railway.app` → `/api/*`                         |
| `hoa-enterprise` | HOA-ENTERPRISE             | Next.js standalone          | `<auto>.up.railway.app`                                    |
| `hoa-residents`  | HOA-RESIDENTS              | Next.js standalone (PWA)    | `<auto>.up.railway.app`                                    |
| `hoa-marketing`  | HOA-MARKETING              | Vite SPA via `serve -s`     | `<auto>.up.railway.app`                                    |
| `Postgres`       | Railway template           | Managed PG 16               | private (consumed via `${{ Postgres.DATABASE_URL }}`)      |
| `Redis`          | Railway template           | Managed Redis 7             | private (consumed via `${{ Redis.REDIS_URL }}`)            |

Each app has a `railway.json` checked into its root that locks the
build + start command + healthcheck. Railway's Nixpacks builder reads
`package.json` engines + scripts and produces a Node container; no
Dockerfiles needed.

## 1. Prerequisites

On your workstation:

```bash
npm i -g @railway/cli       # Railway CLI 3.20+
railway login               # opens browser
railway whoami              # sanity check
```

You also need Node 18+ on PATH (used for VAPID keypair generation via
`npx web-push`). The PowerShell script generates all other secrets via
.NET's `System.Security.Cryptography`, so OpenSSL is only required for
the bash variant.

## 2. Run the setup script

Two interchangeable entry points — pick whichever matches your shell.
Both produce the same Railway state and are equally idempotent.

**Windows PowerShell (5.1 or 7+):**

```powershell
# Optional: wire each service to its GitHub repo so deploys auto-trigger
# on push. Without this, services are created empty and the operator
# wires the source in Step 4 below (one-click in the Railway UI).
$env:GITHUB_OWNER = 'kolagrey'      # ← your GitHub user/org

.\scripts\setup-railway.ps1
# …or pass as a parameter instead of an env var:
.\scripts\setup-railway.ps1 -GithubOwner kolagrey
```

If PowerShell refuses to execute the script with an "execution policy"
error, allow it for the current session only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\setup-railway.ps1
```

**bash (Git Bash on Windows, macOS, Linux, or WSL):**

```bash
export GITHUB_OWNER=kolagrey        # ← your GitHub user/org

bash scripts/setup-railway.sh
```

The bash variant additionally requires `openssl` on PATH (Git for
Windows ships one). Inside WSL: `sudo apt install nodejs npm openssl`.

What it does, in order — every step is idempotent and safe to re-run:

1. Verifies you're logged in (`railway whoami`) and links the checkout
   to project `d436a63d-be9f-49dc-92a7-fd3215684a5f`.
2. **Provisions database addons** if missing:
   - `Postgres` (canonical Railway name; referenced as `${{ Postgres.DATABASE_URL }}`)
   - `Redis`    (canonical Railway name; referenced as `${{ Redis.REDIS_URL }}`)
3. **Creates the four app services** if missing: `hoa-api`,
   `hoa-enterprise`, `hoa-residents`, `hoa-marketing`. When
   `GITHUB_OWNER` is exported, each service is wired to its GitHub repo
   on creation so Railway auto-deploys on push.
4. Generates locally with `openssl rand`, applied only when the
   corresponding variable is currently unset on the API service:
   - `JWT_SECRET` (64 hex chars)
   - `APP_ENCRYPTION_KEY` (32-byte AES-256 key, base64)
   - `STORAGE_URL_SECRET` (signed-URL HMAC secret)
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` via `web-push generate-vapid-keys`
   This guard means re-running the script doesn't rotate keys and
   invalidate live sessions.
5. Pushes all the non-secret config (CORS, URLs, model defaults, mail
   sender, storage root) via `railway variables --set` — all upserts.
6. Wires every cross-service URL as a **Railway reference variable**
   (`${{ hoa-api.RAILWAY_PUBLIC_DOMAIN }}`, `${{ Postgres.DATABASE_URL }}`,
   etc.) so renaming a service or moving environments self-heals every
   consumer.
7. Prints the list of API-key vars you must still set by hand.

Per-service repo overrides — useful if a repo name doesn't match the
default `${GITHUB_OWNER}/HOA-<NAME>` pattern. Both shells read the same
env vars:

```bash
# bash
export HOA_API_REPO=acme/api-backend
export HOA_ENTERPRISE_REPO=acme/admin-console

# PowerShell
$env:HOA_API_REPO = 'acme/api-backend'
$env:HOA_ENTERPRISE_REPO = 'acme/admin-console'
```

## 3. Attach a Volume to `hoa-api`

The Railway CLI doesn't manage volumes yet, so this is the one
post-script step that stays in the UI:

*hoa-api → Settings → Volumes → New Volume*. Mount path
`/data/storage`, size 5 GB+. This is where document uploads land. The
script sets `STORAGE_ROOT=/data/storage`; without the volume, file
uploads fail loudly at runtime.

## 4. Connect GitHub sources (only if GITHUB_OWNER was unset)

Skip this section if you exported `GITHUB_OWNER` before running the
script — repos are already wired.

Otherwise, for each app service: *Settings → Source → Connect Repo*
and pick the corresponding repository. Railway auto-detects the
`railway.json` in the repo root and uses its build + start commands.
No further build config needed.

## 5. Set the manual API keys

Open each service in the Railway dashboard → *Variables* tab, and add:

**`hoa-api`:**

| Var                      | Source                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| `OPENAI_API_KEY`         | https://platform.openai.com/api-keys                                   |
| `ANTHROPIC_API_KEY`      | https://console.anthropic.com/settings/keys (optional fallback)        |
| `RESEND_API_KEY`         | https://resend.com/api-keys                                            |
| `RESEND_WEBHOOK_SECRET`  | only if you wire the Resend → `/api/mail/webhook` integration          |
| `PAYSTACK_SECRET_KEY`    | https://dashboard.paystack.com/#/settings/developer                    |
| `PAYSTACK_PUBLIC_KEY`    | (same dashboard, "Public Key" field)                                   |
| `SENTRY_DSN`             | optional — https://sentry.io/settings/projects/                        |
| `POSTHOG_API_KEY`        | optional — https://us.posthog.com/project/settings                     |
| `METRICS_BEARER`         | optional — lock `/metrics` scrape with `Authorization: Bearer <value>` |

**`hoa-enterprise`** and **`hoa-residents`** (optional, paste the same
values into both for unified telemetry):

| Var                       | Notes                                  |
| ------------------------- | -------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN`  | Sentry browser DSN (different project) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project key                    |

**`hoa-marketing`**: no API keys required.

## 6. Deploy order

After secrets land, kick the first deploy. Railway redeploys on push
to the linked branch, so usually you just commit — but for the very
first boot, force a deploy from the dashboard or run:

```bash
railway up --service hoa-api          # boots, runs `prisma db push`, then `node dist/main`
railway up --service hoa-enterprise   # depends on hoa-api being reachable for build-time URLs
railway up --service hoa-residents
railway up --service hoa-marketing
```

Healthchecks:

- `hoa-api`        → `GET /api/docs`  (Swagger landing page)
- `hoa-enterprise` → `GET /login`
- `hoa-residents`  → `GET /login`
- `hoa-marketing`  → `GET /`

Railway will mark each service "Active" once the corresponding 200 is
returned. If a healthcheck fails, the deploy is rolled back and the
previous good image keeps serving (zero-downtime).

## 7. Custom domains (optional)

Per service → *Settings → Domains → Add Custom Domain*:

- `hoa-api`        → `api.hoa.africa`
- `hoa-enterprise` → `admin.hoa.africa`
- `hoa-residents`  → `app.hoa.africa`
- `hoa-marketing`  → `hoa.africa` + `www.hoa.africa`

After DNS resolves, overwrite the URL vars so emails + CSP point at the
custom hostnames instead of the `.up.railway.app` defaults. The Railway
reference vars (`${{ … .RAILWAY_PUBLIC_DOMAIN }}`) are *fallbacks* —
when you set `APP_ENTERPRISE_URL` explicitly to `https://admin.hoa.africa`,
that wins.

On `hoa-api`, also widen `CORS_ORIGIN` to include the custom origins:

```
CORS_ORIGIN=https://admin.hoa.africa,https://app.hoa.africa,https://hoa.africa,https://www.hoa.africa
```

## 8. First-time bootstrap data

The API auto-creates an HOA on first registration via `/auth/register`.
For a clean prod environment, you typically:

1. Hit `https://admin.hoa.africa/register` and create the founding admin.
2. Sign in. The API back-fill (`OnModuleInit` + inline-on-login) flips
   `enterpriseAccess=true` on any user holding an admin-shaped role,
   so existing admins migrated from staging keep working without
   manual SQL.

## 9. Verifying the deploy

Quick smoke after first boot:

```bash
# API reachable + docs render
curl -fsS https://api.hoa.africa/api/docs | head -c 200

# Enterprise login renders (HTML 200)
curl -fsSI https://admin.hoa.africa/login

# Resident login renders
curl -fsSI https://app.hoa.africa/login

# Marketing root renders
curl -fsSI https://hoa.africa/
```

Then in the browser:

- Register a new admin via `/register`. Expect an email from
  `noreply@metasession.co` confirming.
- Sign in, confirm the Org name shows in the topbar, switch to a
  different role (if any), confirm the role persists across reloads.
- File upload on `/documents` — confirm the URL returned is
  `https://api.hoa.africa/api/files/...` and that re-downloading works.
  (Confirms the Volume is mounted.)

## 10. Rotating a secret

When you need to rotate `JWT_SECRET` or `APP_ENCRYPTION_KEY`:

```bash
NEW=$(openssl rand -hex 32)
railway variables --service hoa-api --set "JWT_SECRET=$NEW"
# Forces a redeploy automatically. All active sessions get logged out
# (their token signature won't verify under the new secret).
```

For `APP_ENCRYPTION_KEY`, rotation is more invasive — anything
encrypted at rest (currently TOTP secrets) becomes unreadable. Run a
re-encryption migration before rotating, or accept that all 2FA
enrollments must be redone.

## 11. Cost shape (rough)

For early prod:

- `hoa-api` — ~$5–10/mo (single Hobby instance, scales to higher tiers when concurrent users >1000)
- `hoa-enterprise` + `hoa-residents` — ~$3–5/mo each (Next standalone is small)
- `hoa-marketing` — ~$2/mo (serves static files; can be moved to Vercel/Netlify free tier later)
- `Postgres` — ~$5/mo (Hobby), 1GB-ish footprint at low resident counts
- `Redis` — ~$5/mo (Hobby), used only for BullMQ queues + future MFA challenge cache

Total: ~$25–35/mo for a low-traffic prod environment. Scale up tiers
when residents > a few thousand.

## 12. Files involved

- `HOA-API/railway.json`        — API build + Prisma push + healthcheck
- `HOA-ENTERPRISE/railway.json` — Next standalone build + start
- `HOA-RESIDENTS/railway.json`  — Next standalone build + start (PWA)
- `HOA-MARKETING/railway.json`  — Vite build + `serve -s dist`
- `scripts/setup-railway.sh`    — bash bootstrap (Git Bash / macOS / Linux / WSL)
- `scripts/setup-railway.ps1`   — PowerShell bootstrap (Windows native)

Everything else (CORS, CSP, JWT, secrets) lives in env vars on
Railway, not in source. The script is the only place secrets get
generated; once written to Railway, they stay there.
