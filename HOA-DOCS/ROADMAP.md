# HOA.africa — Implementation Roadmap
### Session-by-session plan to deliver the full PRD

**Status as of:** 2026-05-19  
**PRD reference:** [PRD.md](./PRD.md)

## Completion snapshot

- ✅ **Phase 0** — Repo split, design system, Gate Pass module
- ⏳ **Phase 1** — *1.1 + 1.2 + 1.3 done.* 1.4 (mobile money) + 1.5 (storage) deferred — Railway storage substitutes for R2. (5 sessions)
- ⏳ **Phase 2** — *2.1 + 2.2 + 2.5 done.* 2.3 / 2.4 deferred. (5 sessions)
- ✅ **Phase 3** — Admin Governance (Violations, Voting/Surveys, Payables+Approvals, Resale/Attorney)
- ✅ **Phase 4** — Financial Reporting & Banking (Statements, Budgets+Funds, Bank sync, Recon)
- ✅ **Phase 5** — Dashboards & Team Management (incl. Custom roles & permissions)
- ✅ **Phase 6** — Enterprise Security (MFA/TOTP, refresh tokens + sessions, magic links, IP allowlist, audit hash chain)
- ⏳ **Phase 7** — *Partial:* 7.1/7.2/7.5/7.6 done. 7.3, 7.4 pending (need WhatsApp infra).
- ✅ **Phase 8** — FX, POPIA/GDPR (export/erasure/consent), i18n (en/fr/pt/sw)
- ⏳ **Phase 9** — *Partial:* 9.2 done (Webhooks + API keys + rate limiting). 9.1, 9.3 pending.
- ⏳ **Phase 10** — *Not started* (3 sessions, ~2 weeks)
- ⏳ **Phase 11** — *Not started* (4 sessions, ~3 weeks)

**Tally:** ~31 of ~42 sessions shipped (Phase 1 partial, Phase 2 partial, Phase 7 partial, Phase 9 partial). Remaining: 7.3/7.4 (WhatsApp bot — needs WhatsApp infra), 7.5 (Email intel), 9.1 (GraphQL), 9.3 (SDKs), all of Phase 10 (PWA polish) + Phase 11 (field ops).

---

## 1. Where we are today

**Built and verified end-to-end** (3 sessions of work):

| Area | What ships today |
|---|---|
| **Architecture** | 3 repos (HOA-API NestJS+Prisma, HOA-ENTERPRISE admin Next.js, HOA-RESIDENTS PWA Next.js), Postgres via Docker, JWT auth, role-based guards, resident data scoping, CORS multi-origin. |
| **Design system** | Family palette (warm canvas + ember orange + Fraunces/Inter), `Card`/`Button`/`Input`/`Badge`/`Dialog`/`AlertDialog`/`Toast`/`useConfirm` primitives, light-only, no native `alert`/`confirm` anywhere. |
| **Core CRUD** | Organizations, Estates, Units, People, Occupancies, Invoices (basic), Payments (basic, mock webhooks), GL Accounts, Journal Entries, Documents (metadata only), Broadcasts (mock send), Audit Logs (write API but not yet wired to every module). |
| **Reports** | 2 of 50+ — Trial Balance, Arrears. |
| **PRD §6.4 Gate Pass / Visitor Management** | Full vertical: create, share via WhatsApp/SMS links, public visitor view at `/v/<code>`, server-side QR (SVG), gate operator console with override/deny flows, visitor logs + today summary, role-gated `gate_security`. |
| **Auth & RBAC** | JWT login/register, role enum (12 roles), global `JwtAuthGuard` + `RolesGuard`, `@Roles` decorator applied to admin endpoints, resident scoping for invoices/payments/broadcasts. |
| **PWA** | Manifest, SVG icons (regular + maskable), service worker via `next-pwa`, light-only theme. |

**Headline gaps** (per the PRD-vs-code survey):
- ~30% of PRD endpoints exist; ~70% are missing.
- No async queue, no real payments, no real email/SMS/WhatsApp, no AI, no file storage.
- Of 50+ PRD reports, 2 ship today. Of 14 PRD-mandated Prisma models, ~9 ship today.
- No MFA, no refresh tokens, no i18n, no multi-currency conversion logic.

---

## 2. Guiding principles for sequencing

1. **Resident value first** — make the system feel alive for end users (payments, requests) before back-office polish.
2. **Real money before anything else** — payment processor integration is foundational; everything financial is hypothetical until residents can actually pay.
3. **Async/queue infra before features that depend on it** — scheduled comms, OCR, AI, reconciliation all need Bull+Redis first.
4. **Each session is end-to-end** — Prisma model + API + frontend + verification — never half-features split across sessions.
5. **No fake demos** — if a feature ships, it ships with real integrations or is explicitly flagged "mock" in the UI.
6. **AI is last** — it's expensive (per-call cost), it needs real data flowing through the rest of the system, and the PRD's AI features assume the foundation modules exist.
7. **Compliance threaded throughout** — POPIA consent, audit logging, encryption-at-rest live in every phase, not a "compliance session" at the end.

**Session size legend**
- **S** = 1-2 days (15-25 file changes)
- **M** = 3-5 days (30-50 file changes)
- **L** = 1+ week (50+ file changes, multi-day cognitive work)

---

## 3. The roadmap — 11 phases, ~42 sessions

### Phase 0 — Done ✅
- Repo split + RBAC foundation
- Family design system
- Gate Pass / Visitor Management (PRD §6.4)

---

### Phase 1 — Core Resident Value (5 sessions, ~3 weeks)
Make the system viable for residents. Unblocks the actual product loop: levy issued → resident sees it → resident pays → admin reconciles.

| # | Session | Size | Scope |
|---|---|---|---|
| 1.1 ✅ | **Resident Requests backend** | S | `Request`, `RequestCategory`, `RequestComment`, `RequestEvent` models. Full state machine (submitted → triaged → in_progress ⇄ waiting_resident → resolved → closed), category SLA-driven `dueAt`, auto-routing on category creation, internal-vs-resident-visible comments, idempotent transitions, webhook fanout (`request.submitted`/`request.resolved`), audit + event timeline. Admin queue at `/admin/requests` + categories at `/admin/requests/categories`; resident PWA at `/requests`. |
| 1.2 ✅ | **Recurring invoices + late fees + payment plans** | M | `RecurringInvoiceSchedule` + `RecurringScheduleRun` (idempotent via `(parentScheduleId, unitId, periodKey)` unique), `LateFeeConfig` (tiered surcharges with signature-based CAS — re-sweep is a no-op), `PaymentPlan` + `PaymentPlanInstallment` (auto-materialize installment invoices on activate, source invoices flip to `on_plan`, on cancel revert to `sent`). Admin pages at `/finance/recurring` and `/finance/late-fees`. Smoke 12/12. |
| 1.3 ✅ | **Paystack integration** | M | `PaymentIntent` model + provider-agnostic adapter pattern. `PaystackService` (init / verify / HMAC-SHA512 signature verify with `timingSafeEqual`). `PaymentIntentsService` orchestrates intent → webhook → existing PaymentsService (so plan progression + invoice flips + audit + integrator webhooks all fire). Raw-body capture wired in main.ts. Dev mock-checkout path when `PAYSTACK_SECRET_KEY` is unset. Resident "Pay now" + detail page; callback page auto-verifies via `/intents/:id/verify`. Smoke 12/12. |
| 1.4 ⏸️ | **Mobile money (M-Pesa Daraja, MTN MoMo, Airtel Money)** | M | Deferred per user direction — Paystack covers the bulk of African card+mobile-money flows via aggregation. |
| 1.5 ⏸️ | **Document storage (R2 → Railway Volumes)** | M | Substitution decision: use Railway Volumes / persistent storage instead of Cloudflare R2. Re-scope pending. |

**Phase 1 outcome:** A resident can log in, see their invoice, pay via Paystack/M-Pesa, get a receipt, view community documents, and submit a maintenance request. Admin can issue recurring monthly levies and see who paid.

---

### Phase 2 — Async Infrastructure + Real Communications (5 sessions, ~3 weeks)
The PRD §6.2 communications module is currently 100% mock. This phase makes communications real, AND lays the queue infrastructure that unblocks half the remaining roadmap.

| # | Session | Size | Scope |
|---|---|---|---|
| 2.1 ✅ | **Bull + Redis worker infrastructure** | M | BullMQ + `@nestjs/bullmq` + ioredis. 4 queues: `recurring-invoices`, `late-fee-sweep`, `payment-plan-installments`, `webhook-deliveries`. Each has a cron schedule auto-registered at bootstrap. `JobsService` exposes stats / dead-letter / manual-trigger to admins at `/api/jobs`. Admin observability page at `/admin/jobs` with run-now + failed-job retry UI. Redis pinned to `localhost:6385` in docker-compose. Smoke 8/8. |
| 2.2 ✅ | **Resend email + React Email templates** | M | `EmailDelivery` model with dedup index. 5 React Email templates: invoice_issued, payment_received, magic_link, request_update, gate_pass_shared. `MailService` enqueues + delivers via `email-deliveries` BullMQ queue; Resend adapter handles real send, mock provider runs in dev. Resend Svix webhook updates `delivered`/`opened`/`clicked`/`bounced` statuses. Auto-fires on invoice issuance, payment receipt, magic-link request. Admin email log + resend at `/api/mail`. Smoke 7/7. |
| 2.3 | **Africa's Talking SMS + bulk dispatch via worker** | S | Real SMS dispatch through `worker-comms`. Delivery reports. Per-country SMS sender ID. Cost tracking. PRD §6.2. |
| 2.4 | **WhatsApp Business API (Meta Cloud) — transactional only** | M | Send-only WhatsApp at first (no AI bot yet). Templates registered in Meta Business Manager. Invoice issued, payment received, gate pass shared via WA. PRD §6.5.1 (send-only subset). |
| 2.5 ✅ | **Mass broadcast 2.0: segmentation, merge fields, scheduling, opt-out** | M | `Broadcast` extended + `BroadcastDelivery` + `BroadcastOptOut` models. `BroadcastsService` with segment resolution (allOwners / paidUpOnly / debtorMinAmount / estateIds / unitTagIn / residenceStatusIn / personIds), merge-field substitution ({{firstName}}, {{unitNumber}}, {{outstandingAmount}}, etc.) validated at create-time, draft→scheduled→sending→sent state machine, CAS-guarded sendNow, per-recipient `BroadcastDelivery` rows for audit. Stateless HMAC opt-out tokens (no row pre-issuance hack). Topic-scoped + global opt-outs both honored. Smoke: 12 main checks + 6-step opt-out lifecycle pass. |

**Phase 2 outcome:** Every transactional event sends a real email/SMS/WA. Admin can schedule a monthly newsletter to all paid-up owners.

---

### Phase 3 — Admin Governance ✅ (4 sessions)
Round out the operational tools that exco/property-manager teams need monthly.

| # | Session | Size | Scope |
|---|---|---|---|
| 3.1 ✅ | **Violations module (capture → notice → fine → appeal)** | M | `Violation`, `ViolationCategory`, `ViolationAppeal`, `ViolationEvent` models. State machine, appeals workflow, repeat-offender analytics. |
| 3.2 ✅ | **Voting & surveys** | M | `Vote`, `Ballot`, `VoteProxy`, `Survey`, `SurveyResponse` models. Anonymous-hash ballots, quorum + threshold logic, proxy chain prevention, special-resolution gates. |
| 3.3 ✅ | **Vendor + Payables + multi-tier approval workflow** | L | `Vendor`, `VendorInvoice`, `ApprovalRule`, `Approval` models. Default approval rules seeded at org creation. Duplicate-invoice constraint, self-approval prevention, sequential/any/all modes, batch pay. |
| 3.4 ✅ | **Resale documents + attorney portal** | M | `ResaleCertificate`, `ResaleAccessLink`, `ResaleAccessLog`, `ResaleEvent` models. Financial snapshot at issue time, public `/r/<token>` attorney view, rate-limited, access-logged. |

**Phase 3 outcome:** Exco can hold an AGM, run a vote, log violations with photos, approve vendor payments, and handle property transfers — all in-app.

---

### Phase 4 — Financial Reporting & Banking ✅ (4 sessions)
The bookkeeping engine.

| # | Session | Size | Scope |
|---|---|---|---|
| 4.1 ✅ | **Core financial statements + PDF generation** | M | Income Statement, Balance Sheet, Cash Flow. Board-pack bundling via `@react-pdf/renderer`. |
| 4.2 ✅ | **Budgets + variance + fund accounting** | M | `Budget`, `BudgetLine`, `Fund` models. Multi-fund tagging on journal entries. Variance dashboards. |
| 4.3 ✅ | **Bank integrations (rule-based categorization)** | L | `BankAccount`, `BankTransaction`, `CategorizationRule` models. Manual/CSV import path; OAuth-stubbed sync ready for Mono/Stitch wiring. |
| 4.4 ✅ | **Bank reconciliation UI + matching engine** | M | Suggest-match algorithm, one-click reconcile, unmatched queue, closed-period lock. |

**Phase 4 outcome:** HOA can produce a full board pack PDF, see real-time reserve fund adequacy, sync bank transactions nightly, and reconcile against the GL.

---

### Phase 5 — Dashboards & Team Management ✅ (3 sessions)
Role-specific homepages and proper team management.

| # | Session | Size | Scope |
|---|---|---|---|
| 5.1 ✅ | **Role-specific dashboards** | M | Admin / Exco / Resident / Gate dashboards with role-aware widget composition. |
| 5.2 ✅ | **Team management: invites, bulk import, time-bound roles** | M | `Invite`, `InviteRedemption`, CSV bulk-invite (validated per-row), role expiry enforcement, login history. |
| 5.3 ✅ | **Custom roles + granular permissions** | M | `CustomRole` with permission-subset enforcement on create/update; `@RequirePermissions` + `PermissionsGuard`; admin escalation blocked at invite-mint time. |

**Phase 5 outcome:** Each persona logs in to a dashboard that's actually theirs. HOA admin can invite a finance officer with R5k approval cap.

---

### Phase 6 — Enterprise Security ✅ (3 sessions)
Hardening for paying customers.

| # | Session | Size | Scope |
|---|---|---|---|
| 6.1 ✅ | **MFA (TOTP) + passwordless magic links** | M | TOTP enroll/verify/disable (requires both password + code), recovery codes (atomic single-use consume), enumeration-resistant magic links. SMS fallback wires in once Phase 2.3 lands. |
| 6.2 ✅ | **Refresh tokens + session management + device trust** | M | `Session` + `TrustedDevice` models. Refresh-token rotation with family-burn detection on reuse. `sessionVersion` enables admin force-logout-all. |
| 6.3 ✅ | **Audit log immutability + IP allowlist** | L | Prisma `$use` hash-chain middleware over canonical JSON, `verifyChain` endpoint walks per-org chain. IP allowlist guard fail-closed when Authorization header present. SSO/SAML deferred — current SSO need is satisfied by magic-link + MFA. |

**Phase 6 outcome:** A board chair can enforce MFA-for-finance-roles. An enterprise HOA can SSO via their Microsoft tenant.

---

### Phase 7 — AI Layer (6 sessions) — *partial*
The PRD's "intelligence by default" pillar.

| # | Session | Size | Scope |
|---|---|---|---|
| 7.1 ✅ | **AI Engine scaffold (in-process inside HOA-API)** | M | `LlmProvider` interface, `MockLlmProvider` for dev, `AnthropicLlmProvider` for prod (lazy SDK import). Fail-loud in prod when no key configured. Decision: kept in-process rather than spinning a separate Python service — Anthropic JS SDK is mature, latency is lower, RBAC enforcement happens at the same boundary. |
| 7.2 ✅ | **NLP intent classifier + entity extractor** | M | 10 intents with `allowedRoles` sets. Entity extractors for amounts, dates, units, durations, emails, phones. `redactForLlm()` strips PII before sending historical messages. `LLM_FALLBACK_ROLES` env gates who reaches the model. |
| 7.3 | **WhatsApp AI bot — read intents** | M | Read-only first: check balance, view last invoice, view active gate passes, view notices. OTP authentication on first message. Session expiry. Depends on Phase 2.4 (WhatsApp send infra). |
| 7.4 | **WhatsApp AI bot — write intents** | M | Payment initiation in-chat, gate pass creation, request submission with photo attachment. Full RBAC enforcement. Audit logging. |
| 7.5 ✅ | **Email intelligence: classify + auto-route + auto-reply drafts** | M | `InboundEmail` + `InboundEmailEvent` models, provider-agnostic webhook handler with `providerMessageId` dedup. Two-stage classifier: rule-based regex first pass (cheap + deterministic), LLM upgrade pass via existing `LlmProvider` only when rules' confidence < 0.6. Auto-routes `request_submission` → creates a `Request` on the sender's primary unit, `vendor_invoice` (with PDF attachment from a known vendor) → creates a `VendorInvoice` draft. Always queues an `EmailDelivery` reply draft (status=pending) using the broadcast template. Admin can approve/escalate/reclassify via `/api/email-intel`. Smoke 10/10. |
| 7.6 ✅ | **Financial anomaly detection** | M | 4 detectors: arrears-spike, vendor-invoice deviation, duplicate-payment, cash-flow shortfall. Signature-based dedup so the same anomaly doesn't pile up. Admin /admin/anomalies queue. Invoice OCR + predictive defaults deferred until R2 (Phase 1.5) ships. |

**Phase 7 outcome:** Residents pay levies by sending "pay 1200 to my unit" on WhatsApp. Admins get an alert when arrears spike. Vendor PDFs auto-import to payables.

---

### Phase 8 — Multi-currency + i18n + Compliance ✅ (3 sessions)

| # | Session | Size | Scope |
|---|---|---|---|
| 8.1 ✅ | **i18n framework + 4 launch languages** | M | Lightweight in-house provider (no extra dep) — `next-intl` plug compatible. en/fr/pt/sw dictionaries. `Accept-Language` server negotiation utility. Locale-aware UI switcher in settings. (af/ha/yo/zu can be added by dropping in JSON files.) |
| 8.2 ✅ | **FX engine + multi-currency invoicing** | M | `ExchangeRate` model (org-scoped overrides + global), 3-day lookback with staleness flag, OXR sync with dedup + per-key throttle. Invoice rate-lock at issue time (`baseCurrency`, `lockedRate`, `lockedRateAsOf`). Refuses to lock stale rates. |
| 8.3 ✅ | **POPIA/GDPR data subject rights + consent capture** | M | `DataExportRequest` (signed bundle, capped queries), `ErasureRequest` (30-day waiting window, CAS-atomic execute, org-scoped vs global), `ConsentRecord` (latest-wins semantics, audit-logged). Cookie banner with policy-version bumping. |

**Phase 8 outcome:** A French-speaking HOA in Côte d'Ivoire invoices residents in XOF and shows everything in French. Compliance team can export everything they have on a resident.

---

### Phase 9 — Platform & API (3 sessions) — *partial*
Make the platform extensible for integrators.

| # | Session | Size | Scope |
|---|---|---|---|
| 9.1 | **GraphQL gateway alongside REST** | M | `@nestjs/graphql` code-first. Same auth/RBAC as REST. Schema covers core entities. Apollo Studio for explore. |
| 9.2 ✅ | **Webhook system + Public API + rate limiting** | M | `ApiKey`, `WebhookEndpoint`, `WebhookDelivery` models. HMAC-SHA256 over `v1.<timestamp>.<body>` (replay-resistant). SSRF defense w/ DNS resolution + private/CGNAT/link-local/multicast blocks. Per-key in-memory token bucket (Redis swap pending Phase 2.1). Dispatcher wired into payment/pass/violation/broadcast events. |
| 9.3 | **SDK libraries: JS/TS + Python** | S | Codegen from OpenAPI spec. Published as `@hoa-africa/sdk` (TS) and `hoa-africa` (Python). Basic auth + each module's endpoints. Interactive sandbox docs. |

**Phase 9 outcome:** Third-party accountants pull HOA data into their tools. Hardware vendors (boom gates) receive webhooks on pass.created.

---

### Phase 10 — PWA & Resident UX polish (3 sessions, ~2 weeks)

| # | Session | Size | Scope |
|---|---|---|---|
| 10.1 | **Push notifications + offline cache + install banner UX** | M | Web push (VAPID keys, NestJS push module). Service worker offline cache for last statement / gate passes / notices. Install prompt UX. Lighthouse PWA score >90. PRD §6.6.3. |
| 10.2 | **Real PWA icons + splash screens + branded onboarding** | S | Designer-produced icon set (multiple sizes). iOS splash screens. Per-HOA branding (logo + accent color override). Welcome onboarding tour for first-time residents. PRD §6.6. |
| 10.3 | **Resident profile + notification preferences + occupant management** | M | Resident edits profile, manages occupants (e.g., add a tenant or dependent), vehicle list, notification preferences per channel. PRD §6.6.2. |

**Phase 10 outcome:** Residents get push notifications when their visitor arrives at the gate. The PWA installs cleanly on Android and iOS.

---

### Phase 11 — Field Operations & Operational Maturity (4 sessions, ~3 weeks)

| # | Session | Size | Scope |
|---|---|---|---|
| 11.1 | **Camera-based QR scanner for /gate console + hardware integration hooks** | M | Add `@yudiel/react-qr-scanner` to gate console. Webhook receivers for boom gates / turnstiles (ZKTeco, HID, Paxton vendor protocols). ANPR webhook. PRD §6.4.2, §6.4.4. |
| 11.2 | **Bookkeeping service tier + accountant workflows** | M | `BookkeepingEngagement`, `BookkeepingTier` models. Monthly close checklist. Exception review queue. Year-end pack. CIPC/regulatory filing template. Dedicated bookkeeper assignment. PRD §6.1.6. |
| 11.3 | **Observability: Sentry + Posthog + Prometheus** | M | Error tracking via Sentry across all 3+ services. Product analytics via PostHog (already partially wired). API metrics via Prometheus + Grafana on Railway. Alerts to ops Slack. |
| 11.4 | **Subscription billing for HOAs themselves** | M | Platform-level billing: per-unit pricing tier, Stripe Billing integration, plan upgrade/downgrade, dunning. PRD §10.1 implies but doesn't detail; needs product alignment. |

**Phase 11 outcome:** A real gate operator scans a QR with the tablet camera instead of typing the code. Metasession Ops gets paged when error rates spike. HOAs are billed monthly via Stripe.

---

## 4. Recommended next 3 sessions (from here, 2026-05-19)

Phases 3–8 + 9.2 are shipped. Highest-leverage remaining work, by user direction:

1. **Session 1.1 — Resident Requests backend** (S). Closes the existing UI stub. Mirrors the Gate Pass pattern. No infra deps. Currently in progress.
2. **Session 1.2 — Recurring invoices + late fees + payment plans** (M). Bridges to real billing.
3. **Session 1.3 — Paystack integration** (M). Highest-leverage feature in the whole product — until residents can pay, the rest is a demo.

Beyond these three, sequence by user-led priority — the phases above are designed so any session within a phase can be reordered without breaking dependencies, but the **phase order matters** (1 before 4, 2 before 7, etc.).

---

## 5. Out of scope (parking lot, not in this roadmap)

These are mentioned in the PRD but explicitly deferred until needed:
- Native mobile apps (PRD §4.2 "future") — the PWA covers mobile.
- SOC 2 Type II audit — PRD §6.9.3 "roadmap" — operational, not engineering.
- Dedicated Railway instance per large HOA (data sovereignty) — addressed by Railway's enterprise tiering when needed.
- Multi-region replication — primary stays us-west2 + Cloudflare CDN edge per PRD §4.5.
- Calendar / e-signature / ID verification integrations — Phase 9.2 webhooks unlock 3rd-party integrators to handle these.

---

## 6. Status tracking

Each session's deliverables, verification checklist, and out-of-scope notes will be captured in a dedicated plan file at `~/.claude/plans/<session-name>.md` (matches the existing pattern used for the repo split, design migration, and gate pass sessions). After execution, this roadmap should be edited to mark sessions ✅ done.

Phases 0 ✅ — Phase 11 estimated: **~42 sessions, ~9 months single-track**, or significantly compressed in parallel across multiple agents/devs.
