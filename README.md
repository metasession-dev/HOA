# HOA.africa

The property-management platform purpose-built for African homeowners'
associations, estates, and complexes. Four front-ends, one API, one
monorepo.

> If you're standing up a fresh environment, jump to **[Quick start](#quick-start)**.
> If you're deploying to Railway, see **[`RAILWAY_DEPLOY.md`](./RAILWAY_DEPLOY.md)**.
> If you're new to the codebase, skim **[Architecture](#architecture)** then **[App-by-app guide](#app-by-app-guide)**.

---

## What lives in this repo

| Directory          | App                                           | Stack                                          | Local port |
| ------------------ | --------------------------------------------- | ---------------------------------------------- | ---------- |
| `HOA-API/`         | Backend API + job workers                     | NestJS 10 · Prisma 5 · Postgres 16 · BullMQ    | `3003`     |
| `HOA-ENTERPRISE/`  | Admin console (board, exco, property mgr)     | Next.js 14 (App Router, standalone build)      | `3002`     |
| `HOA-RESIDENTS/`   | Resident PWA (mobile-first, offline-capable)  | Next.js 14 + `next-pwa`                        | `3005`     |
| `HOA-MARKETING/`   | Public marketing site (hoa.africa)            | Vite + React Router                            | `8080`     |
| `HOA-DOCS/`        | PRD, ROADMAP, design tokens, brand assets     | Markdown + SVG                                 | —          |
| `HOA-SDK-JS/`      | JS/TS client SDK (auto-generated from OpenAPI)| TypeScript                                     | —          |
| `HOA-SDK-PY/`      | Python client SDK                             | Python                                         | —          |
| `scripts/`         | Cross-cutting ops scripts (Railway bootstrap) | Bash + PowerShell                              | —          |

Each app has its own `package.json`, `node_modules`, `.env`,
`README.md` (where applicable), and `railway.json`. There is no
top-level workspace orchestrator — each app installs and builds
independently. This keeps blast radius small: a dependency change in
the resident PWA can't accidentally break the API build.

---

## Quick start

Prerequisites: **Node 18+**, **npm 10+**, **Docker** (for Postgres + Redis),
and **git**. macOS / Linux / Windows are all supported.

```bash
# 1. Clone and enter
git clone https://github.com/metasession-dev/HOA.git
cd HOA

# 2. Bring up Postgres + Redis (one command, runs on ports 5435 + 6385)
cd HOA-API && npm run infra:up && cd ..

# 3. Set up the API
cd HOA-API
cp .env.example .env                       # fill in the blanks (LLM key etc.)
npm install
npx prisma db push                         # schema → DB, no migration file
npm run dev                                # listens on :3003
```

In separate terminals — install + run each front-end:

```bash
# Admin console
cd HOA-ENTERPRISE && cp .env.example .env && npm install && npm run dev

# Resident PWA
cd HOA-RESIDENTS  && cp .env.example .env && npm install && npm run dev

# Marketing site
cd HOA-MARKETING  && cp .env.example .env && npm install --legacy-peer-deps && npm run dev
```

Now you have:

- API docs:        <http://localhost:3003/api/docs>
- Admin login:     <http://localhost:3002/login>
- Resident PWA:    <http://localhost:3005/login>
- Marketing site:  <http://localhost:8080/>

Register a user at `/register` on either app — the first user becomes
a `hoa_admin` and the back-fill flips `enterpriseAccess=true` so they
can sign into the admin console.

---

## Architecture

```
┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐
│   HOA-MARKETING     │  │   HOA-ENTERPRISE    │  │   HOA-RESIDENTS  │
│ (Vite SPA, public)  │  │ (Next.js, JWT auth) │  │ (Next.js PWA)    │
└──────────┬──────────┘  └──────────┬──────────┘  └────────┬─────────┘
           │                        │                       │
           │     /register CTAs     │     /api/* (JWT)      │
           └────────────►──────────►│◄──────────────────────┘
                                    │
                          ┌─────────▼─────────┐
                          │     HOA-API       │
                          │ (NestJS, Prisma)  │
                          └─────────┬─────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  │                 │                 │
            ┌─────▼─────┐    ┌──────▼──────┐   ┌──────▼──────┐
            │ Postgres  │    │ Redis (BullMQ)│  │  Resend     │
            │   (PII)   │    │ (jobs queue)  │  │  (email)    │
            └───────────┘    └───────────────┘  └─────────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │ Paystack · LLM  │
                                              │ (OpenAI/Anthropic)│
                                              └─────────────────┘
```

**Authentication.** JWTs only — no sessions. The API issues short-lived
access tokens (`24h`) signed with `JWT_SECRET`. Both Next apps store
the token in `localStorage` AND mirror it as a non-HttpOnly
`hoa_token` cookie so the Next.js middleware can gate routes
server-side. Cross-app role-switching uses a one-shot URL fragment
handoff (`#token=…&role=…`) that's stripped immediately on landing,
so the token never hits any server log.

**Authorisation.** Role-based via `@Roles(...)` decorators on
controllers, plus org-scoped query helpers (`scope.util.ts`) to
prevent IDOR. Admin-shaped roles also require `User.enterpriseAccess`
on top of the role — resident-only users can't even POST to
`/auth/login` from the admin app.

**Background work.** BullMQ on Redis. Five queues:
recurring-invoices, late-fee-sweep, payment-plan-installments,
webhook-deliveries, email-deliveries. The same NestJS process serves
HTTP and dequeues jobs by default; in production we can split a
dedicated worker service by setting `JOBS_DISABLED=1` on the API
service and running a parallel worker process.

**Idempotency.** Every state-changing endpoint accepts an
`Idempotency-Key` header. The frontend `api` clients auto-generate a
UUID for every POST/PUT/DELETE so retries from double-clicks are safe.

---

## App-by-app guide

### HOA-API (NestJS)

The single source of truth for every domain object. Modules live
under `src/<domain>/` and follow `controller / service / dto / module`
shape. Every DTO uses `class-validator` with strict whitelisting via
the global ValidationPipe (`forbidNonWhitelisted: true`), so unknown
request fields are rejected with 400 — defends against mass-assignment.

Key cross-cutting modules:

- **`auth/`** — JWT issue, login (with `app` tag enforcing
  enterpriseAccess gate), register, switch-role, password reset,
  TOTP setup (AES-256-GCM at rest).
- **`mail/`** — Resend integration via React Email templates in
  `src/mail/templates/*.tsx`. When `RESEND_API_KEY` is absent, the
  mock provider takes over and still logs `EmailDelivery` rows.
- **`jobs/`** — BullMQ wiring. See `processors/` for the five workers.
- **`common/`** — Prisma service, scope helpers, idempotency
  decorator, audit logger.
- **`assistant/`** — LLM tool-calling loop with per-domain tool
  registries. Falls back to a deterministic mock when no key is set.

**Local DB.** `docker compose up -d` from `HOA-API/` brings up
Postgres on `:5435` (not the default 5432, to avoid host conflicts)
and Redis on `:6385`. The connection string in `.env.example`
already matches. `npm run db:push` writes the schema. No checked-in
migrations — `prisma/schema.prisma` is the source of truth.

**API docs.** Swagger at `/api/docs` once the API is running.
OpenAPI JSON exported via `npm run openapi:export` for the SDKs.

### HOA-ENTERPRISE (Next.js admin)

App Router. Routes under `src/app/(auth)/*` are the login flow;
everything inside `src/app/(dashboard)/*` is gated by
`src/middleware.ts` (cookie presence check) AND the client-side
`AuthProvider` (real token verification on mount).

The sidebar groups are collapsible (one-open-at-a-time pattern).
Settings → Profile / Org / Roles all do optimistic refreshUser()
calls so the topbar updates immediately without a page refresh.

The form primitives live in `src/components/ui/` — `Button`, `Input`,
`Select`, `Drawer` (Sheet wrapper), `EmptyState`, `FileUpload`, etc.
All form-driven Drawers (vs ad-hoc dialogs) so screen-reader and
keyboard nav are uniform.

`output: 'standalone'` in `next.config.js` produces a self-contained
`.next/standalone/server.js` that Railway runs directly. The
`postbuild:standalone` script copies `public/` and `.next/static/`
into the standalone tree (Next.js doesn't do this itself).

### HOA-RESIDENTS (Next.js PWA)

Same shape as ENTERPRISE but `next-pwa`-wrapped, with a custom
service worker injected via `importScripts: ['/custom-sw.js']` for
push notifications. Runtime cache strategies in `next.config.js`
give residents offline read of API GETs (NetworkFirst with 5s
timeout, 30-min TTL). POSTs are never cached.

Manifest, splash screens, and icons regenerate via
`npm run icons` from `public/icons/logo.png`. The PWA install
prompt fires from the topbar on supported browsers.

### HOA-MARKETING (Vite SPA)

Pure static site. Pricing in Naira, CTAs route to ENTERPRISE
`/register`. The `/login` page is a portal chooser sending visitors
to either ENTERPRISE or RESIDENTS. `public/_redirects` and
`vercel.json` provide SPA fallback for hosts other than Railway;
the Railway `railway.json` uses `serve -s dist` so `/login` survives
a hard refresh there too.

---

## Environment variables

Every app has a `.env.example` with field-by-field comments. Highlights:

| Var                          | Where         | Purpose                                                 |
| ---------------------------- | ------------- | ------------------------------------------------------- |
| `DATABASE_URL`               | HOA-API       | Postgres connection string                              |
| `REDIS_URL`                  | HOA-API       | BullMQ queue connection                                 |
| `JWT_SECRET`                 | HOA-API       | Token signing — **must be ≥ 32 random bytes in prod**   |
| `APP_ENCRYPTION_KEY`         | HOA-API       | AES-256-GCM key for TOTP secrets at rest (base64)       |
| `STORAGE_URL_SECRET`         | HOA-API       | HMAC for signed download URLs                           |
| `CORS_ORIGIN`                | HOA-API       | Comma-separated allow-list — **wildcard refused in prod** |
| `OPENAI_API_KEY`             | HOA-API       | LLM provider key (Anthropic fallback supported)         |
| `RESEND_API_KEY`             | HOA-API       | Transactional email                                     |
| `PAYSTACK_SECRET_KEY`        | HOA-API       | Card / mobile-money charges                             |
| `VAPID_PUBLIC_KEY/PRIVATE_KEY` | HOA-API     | Web Push (PWA notifications)                            |
| `NEXT_PUBLIC_API_URL`        | Next apps     | API base, e.g. `http://localhost:3003/api`              |
| `NEXT_PUBLIC_VAPID_KEY`      | HOA-RESIDENTS | Public half of the VAPID pair                           |
| `VITE_ENTERPRISE_URL`        | HOA-MARKETING | CTA target for "Get Started"                            |

In **production**, secrets are managed via Railway (see
`RAILWAY_DEPLOY.md`). In **dev**, copy each `.env.example` to `.env`
and fill in the keys you actually need — the mock providers cover
the rest (email, LLM, payments).

---

## Database workflow

Prisma is the only DB interface. Raw SQL (`$queryRaw`) is forbidden
without an audit comment explaining why.

```bash
# Sync schema → DB (no migration file generated)
npx prisma db push

# Generate a checked-in migration (preferred for prod-bound changes)
npx prisma migrate dev --name add_foo_to_bar

# Regenerate the Prisma client after schema changes
npm run db:generate

# Seed the dev DB with sample HOAs, units, residents
npm run db:seed

# Reset everything (DANGER — drops all data)
npx prisma migrate reset
```

The schema lives at `HOA-API/prisma/schema.prisma`. Prisma DSL
comments use `//` only — JSDoc `/** */` blocks are a parse error.
Every PII field has an inline comment marking its category for the
future POPIA/GDPR data-export generator.

---

## Code style and conventions

- **TypeScript strict everywhere.** `tsc --noEmit` must pass.
- **Comments justify the "why".** If a block of code makes a
  non-obvious trade-off (e.g. why we cache here, why we don't),
  leave a comment explaining it. Avoid restating what the code does.
- **No `any` in new code** unless you've documented why. Use
  `unknown` + a type guard, or genuine types from DTOs.
- **No `window.alert/confirm/prompt`** — use the shared `Dialog` /
  `Drawer` primitives. There's a CI grep that fails the build on
  these.
- **No raw API calls.** Use the per-app `lib/api.ts` client so
  `Idempotency-Key`, `Authorization`, and base URL are uniform.
- **Money is always `Decimal(12, 2)` + currency.** Never store
  amounts as `Number`. Format display via `useOrgSettings().formatMoney`.
- **Timestamps are UTC** in DB; render in user TZ via
  `useOrgSettings().formatDate`. `datetime-local` inputs serialize
  to UTC ISO on submit.
- **Lint:** `npm run lint` per app. ESLint config inherits from
  `eslint-config-next` for the Next apps; the API uses the NestJS
  defaults.

---

## Testing

Each domain ships with a curl-test script or a manual walkthrough
documented in its module. Browser-driven verification uses the
preview tooling (Claude in Chrome / Playwright).

Run before opening a PR:

```bash
# Per app
npx tsc --noEmit       # type-check
npm run lint           # style-check
npm run build          # ensure production build succeeds

# Forbidden-pattern grep (run from repo root)
grep -rE "window\.(alert|confirm|prompt)|\balert\(|\bconfirm\(" \
  HOA-ENTERPRISE/src HOA-RESIDENTS/src
# (no matches expected)
```

If you change a Prisma model, also run `npx prisma generate` so
collaborators don't get a type drift on next pull.

---

## Branching, commits, and PRs

- `main` is the deploy branch — every push triggers Railway.
- Feature work in `feat/<short-name>` branches, bug fixes in
  `fix/<short-name>`, infra/build in `chore/<short-name>`.
- Commit messages: imperative mood, sentence case, optional
  scope prefix. Use Conventional Commits if you like; we don't
  enforce them, but `feat:`/`fix:`/`chore:`/`docs:`/`refactor:`
  prefixes help.
- PRs include a "Why" section (problem statement), a "What"
  section (summary of the change), and a "Test plan" section
  (steps to verify). Squash-merge; the resulting commit
  becomes the canonical history.
- Reviewers look for: scope creep, security holes, missing
  audit logs, missing tests, unhandled error paths,
  cache-invalidation correctness.

---

## Deployment

Production runs on **Railway** in project
`132485f6-967c-4586-a477-85c955fba43b`. Each push to `main` triggers
a per-service deploy (scoped via `watchPatterns` in each app's
`railway.json` so a CSS change in marketing doesn't redeploy the
API).

To stand up the entire platform fresh — including database addons,
service creation, env vars, and cross-service URL wiring — run:

```powershell
# Windows
.\scripts\setup-railway.ps1
```

```bash
# macOS / Linux / WSL / Git Bash
bash scripts/setup-railway.sh
```

Both scripts are idempotent — re-run any time. Full operator runbook
in **[`RAILWAY_DEPLOY.md`](./RAILWAY_DEPLOY.md)**.

---

## Security

- **Reporting:** email `security@hoa.africa` with details. We
  triage within 24 hours.
- **OWASP Top 10 posture:** documented in
  `HOA-DOCS/SECURITY.md` (when present). Highlights:
  RBAC + scope helpers (A01), bcrypt cost-12 + AES-GCM (A02),
  Prisma only (A03), state machines + Idempotency-Key (A04),
  ValidationPipe + CORS allow-list (A05), audit log for every
  sensitive mutation (A09).
- **Secrets** never live in source. The setup script
  generates JWT/encryption/VAPID secrets locally and pushes them
  straight to Railway. Rotation procedure in `RAILWAY_DEPLOY.md`.
- **CSP / HSTS / X-Frame-Options** applied in `next.config.js`
  for both Next apps and as middleware in the API. Customise
  per environment via env-driven hosts in `connect-src`.

---

## Documentation

| Doc                                 | What it covers                                            |
| ----------------------------------- | --------------------------------------------------------- |
| [`HOA-DOCS/PRD.md`](./HOA-DOCS/PRD.md)         | Full product requirements doc — phase plan, modules, edge cases |
| [`HOA-DOCS/ROADMAP.md`](./HOA-DOCS/ROADMAP.md) | Phase order, what's shipped, what's next                  |
| [`HOA-DOCS/DESIGN.md`](./HOA-DOCS/DESIGN.md)   | Visual system, tokens, accessibility targets              |
| [`HOA-DOCS/tokens.json`](./HOA-DOCS/tokens.json) | Design tokens consumed by both Next apps                 |
| [`HOA-API/README.md`](./HOA-API/README.md)     | API-specific dev notes (auth flow, BullMQ shapes)        |
| [`RAILWAY_DEPLOY.md`](./RAILWAY_DEPLOY.md)     | Production deployment runbook                             |

---

## Getting unblocked

If you're stuck and the docs don't answer it:

1. Check the relevant `.env.example` — fields are commented.
2. Check the relevant module's `*.service.ts` — comments
   explain non-obvious decisions inline.
3. Run with `LOG_LEVEL=debug` (API) or open DevTools
   Network tab (front-ends) — most "it doesn't work"
   issues are visible in the API response.
4. Ask in `#engineering` on Slack.
5. File an issue with: what you tried, what you expected,
   what actually happened, and the API response body.

Welcome aboard.
