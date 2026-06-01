# SPEC — Per-Unit Default Billing & Payment Workflow

Status: **Approved 2026-06-01** · Owner: Engineering · Supersedes: ad-hoc recurring-only billing

This spec defines how HOA.africa attaches default billings to units (water, service
charge, association dues), lets admins configure their price and term, activates them
per unit, lets residents pay for any term, and tracks every cent with a payment ledger.
It is grounded in the existing `HOA-API` (NestJS + Prisma), `HOA-ENTERPRISE`, and
`HOA-RESIDENTS` code and is designed to ship in five backward-compatible phases.

---

## 1. Goals & guiding principles

**Goals (from the request):**
1. Every unit comes with default billings (water, service charge, association dues),
   attachable when the unit is created.
2. Activate a billing for one or more units (bulk activate/deactivate).
3. Track payments consistently, accurately, with strong data integrity.
4. Admins set up the catalog of billing types: price and term (daily, monthly,
   quarterly, bi-annual, annual, …).
5. Residents may pay for **any** term they choose for these defaults (e.g. 6 months of
   dues up front, or a single day of water).
6. Enterprise-grade, coordinated finance + payment workflow.

**Guiding principles:**
- **THE integrity invariant — balances are server-derived from a ledger.**
  `balanceDue = amount − SUM(PaymentAllocation.amount)`, never computed on the client.
  This deletes the three divergent balance calculations today (`payments.service.ts`,
  `payment-intents.service.ts`, and the client sum at `HOA-RESIDENTS/.../invoices/page.tsx:28`).
- **One invoice per (billingType × unit × period).** A "term" is a *set* of period
  invoices, reusing the proven dedupe `@@unique([parentScheduleId, unitId, periodKey])`
  + `createMany({ skipDuplicates })` (`recurring.service.ts:268`).
- **Catalog price ≠ cron cadence.** A `BillingType.baseTerm` (e.g. daily water) is a
  *pricing/prepay unit*, not a scheduling frequency.
- **Money moves only inside a transaction with a row lock + DB idempotency key.**
- **Additive, reversible migration.** Every new column is nullable; `billingTypeId = null`
  is the legacy path; nothing existing is re-priced or voided.

---

## 2. Confirmed decisions (2026-06-01)

1. **Proration: per-type.** `whole_period` for `service_charge` / `association_dues`
   (buy N whole base periods); `calendar_day` for `water` / metered.
2. **Existing units: opt-in bulk activate** with preview. Only **new** units auto-attach.
3. **Daily/weekly: prepay-only in v1** (not cron frequencies) to avoid per-unit-per-day
   invoice volume.
4. **Invoice numbering:** add a per-org monotonic `FOR UPDATE` sequence in Phase 4
   (replaces collision-prone count-based `INV-#####`).

Open items still to confirm before the relevant phase: minimum-charge floor for tiny
prepay quotes; prepay-invoice expiry window; forbidding cross-currency credit application
in v1 (recommended); whether to auto-derive per-unit price from `areaSqm` (out of v1).

---

## 3. Data model

### 3.1 New models

```prisma
// Admin-managed catalog (Req 1 & 4). Per-org, mirrors LateFeeConfig precedent.
model BillingType {
  id             String   @id @default(cuid())
  organizationId String
  key            String   // "water" | "service_charge" | "association_dues" | custom slug (immutable)
  name           String
  description    String?
  defaultAmount  Decimal  @db.Decimal(12, 2)   // CANONICAL price, per baseTerm
  baseTerm       String   // daily|weekly|monthly|quarterly|biannual|annual (PRICING unit)
  currency       String?  // null => inherit Organization.currency
  prorationMode  String   @default("whole_period") // whole_period|calendar_day|thirty_day
  roundingMode   String   @default("half_up")      // half_up|bankers
  minChargeMinor Int      @default(0)
  allowResidentPrepay Boolean @default(true)   // Req 5 gate
  attachByDefault     Boolean @default(true)   // Req 1 auto-attach on unit create
  glAccountId    String?
  sortOrder      Int      @default(0)
  isActive       Boolean  @default(true)       // soft-archive
  createdBy      String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  unitBillings UnitBilling[]

  @@unique([organizationId, key])
  @@index([organizationId, isActive])
  @@map("billing_types")
}

// Per-unit attachment + activation (Req 1, 2).
model UnitBilling {
  id             String   @id @default(cuid())
  unitId         String
  billingTypeId  String
  organizationId String   // denormalized — Payment's missing-org-FK mistake not repeated
  amount         Decimal  @db.Decimal(12, 2)   // snapshot at attach; catalog edits don't re-price
  baseTerm       String
  currency       String
  isActive       Boolean  @default(true)        // THE bulk activate/deactivate flag (Req 2)
  startedAt      DateTime?
  deactivatedAt  DateTime?
  createdBy      String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  unit        Unit        @relation(fields: [unitId], references: [id], onDelete: Cascade)
  billingType BillingType @relation(fields: [billingTypeId], references: [id], onDelete: Restrict)
  invoices    Invoice[]

  @@unique([unitId, billingTypeId])   // one attachment per type per unit; attach is idempotent
  @@index([organizationId, isActive])
  @@index([billingTypeId, isActive])
  @@map("unit_billings")
}

// NEW: allocation ledger — source of truth for what money landed where.
model PaymentAllocation {
  id        String   @id @default(cuid())
  paymentId String
  invoiceId String
  amount    Decimal  @db.Decimal(12, 2)   // > 0
  createdAt DateTime @default(now())

  payment Payment @relation(fields: [paymentId], references: [id], onDelete: Restrict)
  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Restrict)

  @@unique([paymentId, invoiceId])   // replay-safe: applied at most once
  @@index([invoiceId])
  @@map("payment_allocations")
}

// NEW: audit/receipt of a resident "pay any term" purchase (NOT a control field).
model PrepaymentCredit {
  id             String   @id @default(cuid())
  organizationId String
  unitBillingId  String
  coverageFrom   DateTime
  coverageTo     DateTime
  termLabel      String
  periodKeys     String[]
  amount         Decimal  @db.Decimal(12, 2)
  currency       String
  createdAt      DateTime @default(now())

  unitBilling UnitBilling @relation(fields: [unitBillingId], references: [id], onDelete: Cascade)

  @@index([unitBillingId, coverageTo])
  @@map("prepayment_credits")
}
```

### 3.2 Extended models (additive)

- **`Invoice`** — add `billingTypeId String?`, `unitBillingId String?`,
  `amountPaid Decimal @default(0)` (server-maintained cache), `allocations PaymentAllocation[]`,
  `@@unique([unitBillingId, periodKey])`, `@@index([organizationId, billingTypeId, status])`.
  Reuse existing `periodKey`, `parentScheduleId`, FX fields, `lineItems`.
- **`Payment`** — make it the receipt header: `invoiceId` becomes **nullable**, add
  `organizationId` FK (missing today), `amountUnallocated Decimal @default(0)`,
  `allocations PaymentAllocation[]`, `@@unique([organizationId, method, processorReference])`,
  `@@index([invoiceId])`.
- **`RecurringInvoiceSchedule`** — add `billingTypeId String?` (a schedule can materialize
  a catalog charge). Existing schedules keep `null` and behave identically.
- **`Organization`** / **`Unit`** — add back-relations.

### 3.3 Idempotency keys

| Layer | Key | New? |
|---|---|---|
| Charge invoice | `@@unique([parentScheduleId, unitId, periodKey])` + `@@unique([unitBillingId, periodKey])` | 1 new |
| Payment receipt | `@@unique([organizationId, method, processorReference])` | NEW |
| Allocation | `@@unique([paymentId, invoiceId])` | NEW |
| Catalog | `@@unique([organizationId, key])` | NEW |
| Attachment | `@@unique([unitId, billingTypeId])` | NEW |

---

## 4. Term / period engine

A pure, DB-free `HOA-API/src/billing/billing-period.service.ts`, shared by the recurring
generator, per-unit generator, and resident quote so they can't diverge.

- **Supported terms:** `daily | weekly | monthly | quarterly | biannual | annual` + custom day-span.
- **Canonical rate:** normalize every price to an exact rational rate-per-day
  (`TERM_DAYS = { daily:1, weekly:7, monthly:30, quarterly:91, biannual:182, annual:365 }`),
  compute in integer minor units, **round only the final total** (`half_up` default).
- **Proration modes** (per `BillingType.prorationMode`): `whole_period` (N whole base
  periods; reuse the month-length clamp in `computeNextRun`); `calendar_day` / `thirty_day`
  (`amount = round(ratePerDay × days)`, enforce `minChargeMinor`).
- **Pay-any-term → periods:** prepay **materializes the real period invoices** for the span
  (status `sent`, future `dueDate`, `billingTypeId`/`unitBillingId`/`periodKey` set). The
  `@@unique([unitBillingId, periodKey])` makes the later cron run a silent no-op. A
  `PrepaymentCredit` records the span for receipts/audit.
- **Sub-monthly keys:** prefixed namespaces so they can't collide with monthly keys —
  `D:YYYY-MM-DD`, `W:YYYY-Www`, `monthly YYYY-MM`, `quarterly YYYY-Qn`, `biannual H:YYYY-Hn`,
  `annual YYYY`. `biannual` is added as a real cron frequency; `daily`/`weekly` are
  prepay-only in v1. Extend `currentPeriodKey`/`computeNextRun` with explicit branches so
  nothing falls through the annual `else`.

---

## 5. Generation & reconciliation

- **Generation:** EXTEND `RecurringInvoicesService` with a per-unit generator running in
  the same daily 02:15 cron; iterate active `UnitBilling` rows, compute `periodKey`, and
  `createMany({ skipDuplicates })` invoices — reusing the FX lock and post-commit email
  enqueue verbatim. Write an `AuditLog` (`unit_billing_generated`).
- **Charge state machine:** `draft → sent → partial → paid`; `overdue` derived
  (`now > dueDate && amountPaid < amount`); `voided` terminal & excluded from balances/late
  fees; prepay-type unpaid → `expired` (no late fee). Late fees become **separate invoices**
  (`BillingType key='late_fee'`), not mutations of `Invoice.amount`.
- **Exactly-once Paystack reconciliation:** rewrite payment-success into one `$transaction`
  with `SELECT … FOR UPDATE`: upsert receipt on the new unique key (retries = no-op),
  currency-code check, allocate oldest-period-first via `paymentAllocation.upsert`
  (replay-safe), update `amountPaid`/`status`, surplus → `amountUnallocated`, `AuditLog`.
  Multi-invoice intent carries `invoiceIds[]`. Refunds reverse allocations.

---

## 6. API surface

**Admin** (`hoa_admin`, `finance_officer`, `super_admin`):
```
GET    /billing/catalog                    list BillingTypes
POST   /billing/catalog                    create
PUT    /billing/catalog/:id                edit
DELETE /billing/catalog/:id                soft-archive (Restrict if UnitBillings exist)
GET    /billing/catalog/:id/preview-run?period=YYYY-MM   dry-run (read-only)
POST   /billing/catalog/:id/run?period=…   materialize a period
POST   /billing/catalog/:id/bulk-activate  { unitIds?|filter?, active, attachIfMissing? }
GET    /units/:id/billings                 per-unit attachments
PUT    /units/:id/billings/:billingId      toggle isActive / override amount
POST   /estates/:estateId/units            EXTEND to pass orgId (auto-attach)
```
**Resident:**
```
GET    /units/:unitId/billings/:ubId/quote?term=|days=|from=&to=   dry-run quote (read-only)
POST   /billing/prepay        { unitBillingId, periods[] }  → materialize invoices + intent
POST   /payments/intents      EXTEND to accept invoiceIds[]
GET    /units/:id/balance     server-derived balance (replaces client sum)
```

---

## 7. UI surfaces (reuse existing components)

**Enterprise:** Settings → Billing catalog (model on `settings/payment-configuration`);
replace both `LINE_ITEM_PRESETS` datalists (`recurring/page.tsx:47`, `invoices/new/page.tsx:23`)
with a `GET /billing/catalog` fetch; unit-detail Billings card; Finance → Billing activation
(bulk activate/deactivate **with preview**).
**Resident:** per-charge balance grouping on the invoices page (delete the client-side sum);
choose-term + prepay on the invoice/dashboard pay card → existing Paystack redirect.

---

## 8. Unit-creation hook

Single seam: `UnitsService.create()` (`units.service.ts:125`) — both single and `bulkCreate`
funnel through it. Requires passing `organizationId` (the controller doesn't today). Wrap in
`$transaction`; after `tx.unit.create`, read `attachByDefault` billing types and
`createMany({ skipDuplicates })` `UnitBilling` rows (amount/baseTerm/currency snapshotted).
Apply the same block in the `bulkCreate` per-row try/catch.

---

## 9. Phased rollout (backward-compatible)

1. **Catalog** *(this phase)* — `BillingType` + Settings→Billing catalog + replace the two
   `LINE_ITEM_PRESETS` datalists with the catalog. No behavior change.
2. **Attachment + activation** — `UnitBilling`, auto-attach on unit create (+ orgId signature),
   per-unit Billings card, bulk-activate with preview.
3. **Per-charge generation + reporting** — `Invoice.billingTypeId`/`unitBillingId`, per-unit
   generator in the cron, `preview-run`/`run`, per-charge resident grouping.
4. **Payment hardening (BLOCKING)** — `PaymentAllocation`, `Payment` unique + nullable
   `invoiceId` + `amountPaid`, transactional locked reconciliation, multi-invoice intent,
   refund reversal, per-org invoice sequence. Backfill one allocation per existing payment →
   reproduces every current balance exactly. **Gates Phase 5.**
5. **Resident prepay / choose-your-term** — quote + prepay endpoints, sub-monthly namespaces,
   `biannual` frequency, resident term-selector UI.

Existing `RecurringInvoiceSchedule`s keep working unchanged (`billingTypeId = null`).

---

## 10. Data-integrity guarantees

Server-derived balances; transactions with `FOR UPDATE` on the money path; unique
constraints on receipt + allocation + charge + catalog + attachment; replay-safe upserts;
currency-code check; `AuditLog` on allocation/activation/generation/prepay; surplus captured
as credit (no silent overpayment); immutable charge amounts (late fees are separate invoices;
prices snapshotted on attach); `onDelete: Restrict` on catalog + allocation FKs.
