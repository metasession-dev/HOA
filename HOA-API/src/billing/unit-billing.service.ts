import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { Actor } from '../common/scope.util';
import { FxService } from '../fx/fx.service';
import { reserveInvoiceNumbers } from '../common/invoice-number';
import { assertNoBillingPathConflict } from './billing-overlap';

type Target = { unitIds?: string[]; estateIds?: string[] };

// baseTerms that auto-generate one invoice per period. daily/weekly are
// prepay-only in v1 (confirmed decision) — they never auto-bill.
const SCHEDULABLE_TERMS = new Set(['monthly', 'quarterly', 'biannual', 'annual']);

/** Period key for a baseTerm at a given date (UTC, deterministic). Mirrors the
 *  recurring engine's namespaces so reports line up. */
function periodKeyFor(baseTerm: string, d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-11
  switch (baseTerm) {
    case 'quarterly': return `${y}-Q${Math.floor(m / 3) + 1}`;
    case 'biannual': return `H:${y}-H${m < 6 ? 1 : 2}`;
    case 'annual': return `${y}`;
    case 'monthly':
    default: return `${y}-${String(m + 1).padStart(2, '0')}`;
  }
}

// ---- Phase 5 prepay period math ----
// Canonical days per term for day-prorated (calendar_day) charges.
const TERM_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30, quarterly: 91, biannual: 182, annual: 365 };
// Terms a resident prepays by WHOLE PERIODS (buy N months/quarters/…). daily and
// weekly are prepaid by DAY span instead.
const PERIOD_TERMS = new Set(['monthly', 'quarterly', 'biannual', 'annual']);

function startOfUtcDay(d: Date): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
function addUtcDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 86400000); }
function isoDay(d: Date): string { return d.toISOString().slice(0, 10); }

/** First instant of the period (of `baseTerm`) that contains `d`. */
function startOfPeriod(baseTerm: string, d: Date): Date {
  const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  switch (baseTerm) {
    case 'quarterly': return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
    case 'biannual': return new Date(Date.UTC(y, m < 6 ? 0 : 6, 1));
    case 'annual': return new Date(Date.UTC(y, 0, 1));
    case 'monthly':
    default: return new Date(Date.UTC(y, m, 1));
  }
}

/** First instant of the period AFTER the one starting at `from`. */
function nextPeriodStart(baseTerm: string, from: Date): Date {
  const y = from.getUTCFullYear(); const m = from.getUTCMonth();
  switch (baseTerm) {
    case 'quarterly': return new Date(Date.UTC(y, m + 3, 1));
    case 'biannual': return new Date(Date.UTC(y, m + 6, 1));
    case 'annual': return new Date(Date.UTC(y + 1, 0, 1));
    case 'monthly':
    default: return new Date(Date.UTC(y, m + 1, 1));
  }
}

function termUnitLabel(baseTerm: string): string {
  return ({ daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', biannual: 'half-year', annual: 'year' } as Record<string, string>)[baseTerm] || baseTerm;
}

type PrepayPeriod = { periodKey: string; from: Date; to: Date; amountMinor: number };

/**
 * Per-unit billing attachments (Phase 2 of unit-default-billing — see
 * HOA-DOCS/SPEC-unit-default-billing.md).
 *
 * A UnitBilling is a snapshot of a catalog BillingType applied to one unit: its
 * price/term/currency are copied at attach time so later catalog edits don't
 * silently re-price attached units. `isActive` is the activate/deactivate flag.
 *
 * This service powers: the per-unit Billings list/toggle, the bulk
 * activate/deactivate (one or many units), and the auto-attach-on-unit-create
 * hook (`attachDefaults`, called by UnitsService inside its own transaction).
 */
@Injectable()
export class UnitBillingService {
  private readonly logger = new Logger(UnitBillingService.name);

  constructor(private prisma: PrismaService, private fx: FxService) {}

  async listForUnit(orgId: string, unitId: string) {
    await this.assertUnitInOrg(orgId, unitId);
    return this.prisma.unitBilling.findMany({
      where: { unitId, organizationId: orgId },
      include: {
        billingType: { select: { id: true, key: true, name: true, baseTerm: true, prorationMode: true, isActive: true } },
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /** Manually attach a catalog type to a unit (admin override). Idempotent. */
  async attach(orgId: string, actor: Actor, unitId: string, billingTypeId: string, amountOverride?: number) {
    await this.assertUnitInOrg(orgId, unitId);
    const bt = await this.prisma.billingType.findFirst({ where: { id: billingTypeId, organizationId: orgId } });
    if (!bt) throw new NotFoundException('Billing type not found');
    const orgCurrency = await this.orgCurrency(orgId);

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.unitBilling.upsert({
        where: { unitId_billingTypeId: { unitId, billingTypeId } },
        // Attach is idempotent — never clobber an existing snapshot/active state.
        update: {},
        create: {
          unitId,
          billingTypeId,
          organizationId: orgId,
          amount: amountOverride != null ? new Prisma.Decimal(amountOverride) : bt.defaultAmount,
          baseTerm: bt.baseTerm,
          currency: bt.currency || orgCurrency,
          isActive: true,
          startedAt: new Date(),
          createdBy: actor.userId,
        },
      });
      await this.audit(tx, orgId, actor, 'unit_billing_attached', row.id, { unitId, billingTypeId });
      return row;
    });
  }

  /** Toggle active state and/or override the snapshot amount for one attachment. */
  async update(orgId: string, actor: Actor, unitBillingId: string, dto: { isActive?: boolean; amount?: number }) {
    const existing = await this.prisma.unitBilling.findFirst({ where: { id: unitBillingId, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Unit billing not found');

    const data: Prisma.UnitBillingUpdateInput = {};
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      data.deactivatedAt = dto.isActive ? null : new Date();
      if (dto.isActive && !existing.startedAt) data.startedAt = new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.unitBilling.update({ where: { id: unitBillingId }, data });
      await this.audit(tx, orgId, actor, 'unit_billing_updated', row.id, {
        before: { isActive: existing.isActive, amount: existing.amount.toString() },
        after: { isActive: row.isActive, amount: row.amount.toString() },
      });
      return row;
    });
  }

  /** Dry-run for a bulk activate/deactivate: how many units would change. */
  async previewBulk(orgId: string, billingTypeId: string, target: Target) {
    const bt = await this.prisma.billingType.findFirst({ where: { id: billingTypeId, organizationId: orgId } });
    if (!bt) throw new NotFoundException('Billing type not found');
    const unitIds = await this.resolveUnitIds(orgId, target);
    const existing = await this.prisma.unitBilling.findMany({
      where: { billingTypeId, unitId: { in: unitIds } },
      select: { unitId: true, isActive: true },
    });
    const attachedActive = existing.filter((e) => e.isActive).length;
    const attachedInactive = existing.filter((e) => !e.isActive).length;
    const notAttached = unitIds.length - existing.length;
    const sample = await this.prisma.unit.findMany({
      where: { id: { in: unitIds.slice(0, 8) } },
      select: { id: true, unitNumber: true, estate: { select: { name: true } } },
    });
    return {
      billingType: { id: bt.id, name: bt.name },
      totalUnits: unitIds.length,
      attachedActive,
      attachedInactive,
      notAttached,
      sampleUnits: sample.map((s) => ({ id: s.id, unitNumber: s.unitNumber, estateName: s.estate.name })),
    };
  }

  /** Activate or deactivate a billing type across one or many units. */
  async bulkActivate(
    orgId: string,
    actor: Actor,
    billingTypeId: string,
    opts: { target: Target; active: boolean; attachIfMissing?: boolean },
  ) {
    const bt = await this.prisma.billingType.findFirst({ where: { id: billingTypeId, organizationId: orgId } });
    if (!bt) throw new NotFoundException('Billing type not found');
    // Turning the per-unit path ON for a charge that a recurring schedule already
    // bills would double-bill — block it.
    if (opts.active) await assertNoBillingPathConflict(this.prisma, orgId, billingTypeId, 'unit_billing');
    const orgCurrency = await this.orgCurrency(orgId);
    const unitIds = await this.resolveUnitIds(orgId, opts.target);
    if (unitIds.length === 0) throw new BadRequestException('No matching units');

    let activated = 0;
    let created = 0;
    let skipped = 0;

    // Chunk so each transaction stays bounded (mirrors the 1000-row bulk-create cap).
    const CHUNK = 200;
    for (let i = 0; i < unitIds.length; i += CHUNK) {
      const slice = unitIds.slice(i, i + CHUNK);
      // eslint-disable-next-line no-await-in-loop
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.unitBilling.findMany({ where: { billingTypeId, unitId: { in: slice } } });
        const byUnit = new Map(existing.map((e) => [e.unitId, e]));
        for (const uid of slice) {
          const ub = byUnit.get(uid);
          if (ub) {
            if (ub.isActive !== opts.active) {
              // eslint-disable-next-line no-await-in-loop
              await tx.unitBilling.update({
                where: { id: ub.id },
                data: {
                  isActive: opts.active,
                  deactivatedAt: opts.active ? null : new Date(),
                  startedAt: opts.active && !ub.startedAt ? new Date() : ub.startedAt,
                },
              });
              activated += 1;
            } else {
              skipped += 1;
            }
          } else if (opts.active && opts.attachIfMissing) {
            // eslint-disable-next-line no-await-in-loop
            await tx.unitBilling.create({
              data: {
                unitId: uid,
                billingTypeId,
                organizationId: orgId,
                amount: bt.defaultAmount,
                baseTerm: bt.baseTerm,
                currency: bt.currency || orgCurrency,
                isActive: true,
                startedAt: new Date(),
                createdBy: actor.userId,
              },
            });
            created += 1;
          } else {
            skipped += 1;
          }
        }
      });
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: opts.active ? 'unit_billing_bulk_activated' : 'unit_billing_bulk_deactivated',
        entityType: 'BillingType',
        entityId: billingTypeId,
        changes: { activated, created, skipped, totalUnits: unitIds.length, attachIfMissing: !!opts.attachIfMissing } as any,
      },
    });

    return { totalUnits: unitIds.length, changed: activated + created, activated, created, skipped };
  }

  /**
   * Attach every `attachByDefault` catalog type to a freshly-created unit.
   * Runs inside the caller's transaction (UnitsService.create / bulkCreate).
   * Idempotent via `@@unique([unitId, billingTypeId])` + `skipDuplicates`.
   */
  async attachDefaults(
    tx: Prisma.TransactionClient,
    params: { orgId: string; unitId: string; orgCurrency: string; createdBy: string },
  ): Promise<number> {
    const types = await tx.billingType.findMany({
      where: { organizationId: params.orgId, isActive: true, attachByDefault: true },
    });
    if (types.length === 0) return 0;
    await tx.unitBilling.createMany({
      data: types.map((t) => ({
        unitId: params.unitId,
        billingTypeId: t.id,
        organizationId: params.orgId,
        amount: t.defaultAmount,
        baseTerm: t.baseTerm,
        currency: t.currency || params.orgCurrency,
        isActive: true,
        startedAt: new Date(),
        createdBy: params.createdBy,
      })),
      skipDuplicates: true,
    });
    return types.length;
  }

  // ---- charge generation (Phase 3) ----

  /** Dry-run: how many invoices a generation run for this period would create. */
  async previewGeneration(orgId: string, billingTypeId: string, opts: { periodOverride?: string } = {}) {
    const bt = await this.prisma.billingType.findFirst({ where: { id: billingTypeId, organizationId: orgId } });
    if (!bt) throw new NotFoundException('Billing type not found');
    this.assertSchedulable(bt.baseTerm);
    const periodKey = opts.periodOverride || periodKeyFor(bt.baseTerm, new Date());
    const active = await this.prisma.unitBilling.findMany({
      where: { billingTypeId, organizationId: orgId, isActive: true },
      select: { id: true, unitId: true, amount: true },
    });
    const alreadyBilledUnitIds = await this.billedUnitIds(this.prisma, orgId, bt.id, active, periodKey);
    const fresh = active.filter((a) => !alreadyBilledUnitIds.has(a.unitId));
    const totalAmount = fresh.reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
    const orgCcy = (bt.currency || (await this.orgCurrency(orgId))).toUpperCase();
    return {
      periodKey,
      billingType: { id: bt.id, name: bt.name, baseTerm: bt.baseTerm },
      currency: orgCcy,
      totalActive: active.length,
      alreadyBilled: active.length - fresh.length,
      toBill: fresh.length,
      totalAmount: totalAmount.toString(),
    };
  }

  /** Generate one invoice per active unit for a billing type + period. Idempotent
   *  via @@unique([unitBillingId, periodKey]) + skipDuplicates. */
  async generateForType(orgId: string, actor: Actor, billingTypeId: string, opts: { periodOverride?: string } = {}) {
    const bt = await this.prisma.billingType.findFirst({ where: { id: billingTypeId, organizationId: orgId } });
    if (!bt) throw new NotFoundException('Billing type not found');
    this.assertSchedulable(bt.baseTerm);
    // Never bill a charge per-unit if a recurring schedule already bills it.
    await assertNoBillingPathConflict(this.prisma, orgId, billingTypeId, 'unit_billing');
    const periodKey = opts.periodOverride || periodKeyFor(bt.baseTerm, new Date());
    const orgBaseCcy = (await this.orgCurrency(orgId)).toUpperCase();

    const active = await this.prisma.unitBilling.findMany({
      where: { billingTypeId, organizationId: orgId, isActive: true },
      select: { id: true, unitId: true, amount: true, currency: true },
    });
    if (active.length === 0) return { periodKey, created: 0, skipped: 0 };

    // Lock the FX rate per distinct non-base currency once for the batch (read-only,
    // done before the write transaction).
    const fxByCcy = new Map<string, { lockedRate: Decimal; lockedRateAsOf: Date; baseCurrency: string }>();
    for (const ccy of new Set(active.map((f) => (f.currency || orgBaseCcy).toUpperCase()))) {
      if (ccy === orgBaseCcy) continue;
      try {
        const locked = await this.fx.lockedRateForInvoice(orgId, ccy, orgBaseCcy, new Date());
        if (locked) fxByCcy.set(ccy, { lockedRate: locked.rate, lockedRateAsOf: locked.asOfDay, baseCurrency: locked.baseCurrency });
      } catch (err: any) {
        this.logger.warn(`FX lock skipped for ${bt.name} (${ccy}->${orgBaseCcy}): ${err.message}`);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Re-check the already-billed set INSIDE the transaction for a consistent
      // view, so we never double-bill a unit already invoiced for this period.
      const alreadyBilled = await this.billedUnitIds(tx, orgId, bt.id, active, periodKey);
      const fresh = active.filter((a) => !alreadyBilled.has(a.unitId));
      if (fresh.length === 0) return 0;

      const invoiceNumbers = await reserveInvoiceNumbers(tx, orgId, fresh.length);
      const issue = new Date();
      const due = new Date(issue.getTime() + 30 * 86400000);
      const inserts = fresh.map((ub, i) => {
        const ccy = (ub.currency || orgBaseCcy).toUpperCase();
        const fxLock = fxByCcy.get(ccy);
        const amt = new Decimal(ub.amount.toString());
        return {
          organizationId: orgId,
          unitId: ub.unitId,
          invoiceNumber: invoiceNumbers[i],
          type: 'recurring',
          amount: amt,
          originalAmount: amt,
          currency: ccy,
          dueDate: due,
          status: 'sent',
          sentAt: issue,
          // Org policy: every invoice carries at least one line item.
          lineItems: [{ description: bt.name, amount: Number(amt.toString()), quantity: 1 }] as any,
          createdBy: actor.userId,
          baseCurrency: fxLock?.baseCurrency ?? null,
          lockedRate: fxLock?.lockedRate ?? null,
          lockedRateAsOf: fxLock?.lockedRateAsOf ?? null,
          billingTypeId: bt.id,
          unitBillingId: ub.id,
          periodKey,
        };
      });
      const res = await tx.invoice.createMany({ data: inserts as any, skipDuplicates: true });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'unit_billing_generated',
          entityType: 'BillingType',
          entityId: bt.id,
          changes: { periodKey, created: res.count, targeted: fresh.length } as any,
        },
      });
      return res.count;
    });

    return { periodKey, created, skipped: active.length - created };
  }

  /** Generate the current period for every schedulable active billing type in the
   *  org (admin-triggered now; the cron sweep can call this later). */
  async generateDue(orgId: string, actor: Actor) {
    const types = await this.prisma.billingType.findMany({
      where: { organizationId: orgId, isActive: true },
    });
    const schedulable = types.filter((t) => SCHEDULABLE_TERMS.has(t.baseTerm));
    const results: any[] = [];
    let totalCreated = 0;
    for (const t of schedulable) {
      try {
        const r = await this.generateForType(orgId, actor, t.id);
        totalCreated += r.created;
        results.push({ billingTypeId: t.id, name: t.name, ...r });
      } catch (err: any) {
        results.push({ billingTypeId: t.id, name: t.name, error: err.message });
      }
    }
    return { totalCreated, types: results };
  }

  private assertSchedulable(baseTerm: string) {
    if (!SCHEDULABLE_TERMS.has(baseTerm)) {
      throw new BadRequestException(
        'Daily and weekly charges are billed via resident prepay, not scheduled generation.',
      );
    }
  }

  /**
   * Units that have ALREADY been invoiced for this charge in this period and so
   * must be excluded from generation (the no-double-billing guard). A unit is
   * "billed" if it has any non-voided invoice for this period that is tagged
   * with this billing type OR with one of these unit-billing attachments — this
   * covers prior generation, resident prepay, and charge-linked recurring
   * schedules. Returns the set of already-billed unitIds.
   */
  private async billedUnitIds(
    db: Prisma.TransactionClient,
    orgId: string,
    billingTypeId: string,
    active: Array<{ id: string; unitId: string }>,
    periodKey: string,
  ): Promise<Set<string>> {
    if (active.length === 0) return new Set();
    const rows = await db.invoice.findMany({
      where: {
        organizationId: orgId,
        periodKey,
        status: { not: 'voided' },
        unitId: { in: active.map((a) => a.unitId) },
        OR: [
          { billingTypeId },
          { unitBillingId: { in: active.map((a) => a.id) } },
        ],
      },
      select: { unitId: true },
    });
    return new Set(rows.map((r) => r.unitId));
  }

  // ---- resident prepay / choose-your-term (Phase 5) ----

  /** List the charges a resident can prepay across the unit(s) they occupy. */
  async listPrepayableForUser(userId: string) {
    const rows = await this.prisma.unitBilling.findMany({
      where: {
        isActive: true,
        billingType: { isActive: true, allowResidentPrepay: true },
        unit: { occupancies: { some: { isActive: true, person: { userId } } } },
      },
      include: {
        billingType: { select: { id: true, name: true, key: true, baseTerm: true, prorationMode: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      amount: r.amount.toString(),
      baseTerm: r.baseTerm,
      currency: r.currency,
      mode: PERIOD_TERMS.has(r.baseTerm) ? 'period' : 'day',
      billingType: r.billingType,
      unit: r.unit,
    }));
  }

  /** Resolve a unitBilling the given resident is allowed to prepay, or throw. */
  private async resolvePrepayUb(userId: string, unitBillingId: string) {
    const ub = await this.prisma.unitBilling.findFirst({
      where: {
        id: unitBillingId,
        isActive: true,
        billingType: { isActive: true, allowResidentPrepay: true },
        unit: { occupancies: { some: { isActive: true, person: { userId } } } },
      },
      include: { billingType: true },
    });
    if (!ub) throw new NotFoundException('Charge not found or not available for prepayment');
    return ub;
  }

  /** Build the set of period invoices a prepay request would create. Pure read. */
  private async computePrepayPeriods(ub: any, request: { periods?: number; days?: number }): Promise<PrepayPeriod[]> {
    const baseTerm = ub.baseTerm;
    const amountMinor = Math.round(Number(ub.amount.toString()) * 100);

    if (PERIOD_TERMS.has(baseTerm)) {
      const n = Math.max(0, Math.floor(request.periods || 0));
      if (n < 1) throw new BadRequestException('periods must be at least 1 for this charge');
      const existing = await this.prisma.invoice.findMany({ where: { unitBillingId: ub.id }, select: { periodKey: true } });
      const existingKeys = new Set(existing.map((e) => e.periodKey).filter(Boolean) as string[]);
      const periods: PrepayPeriod[] = [];
      let cursor = startOfPeriod(baseTerm, new Date());
      for (let guard = 0; periods.length < n && guard < 600; guard += 1) {
        const from = cursor;
        const to = nextPeriodStart(baseTerm, from);
        const key = periodKeyFor(baseTerm, from);
        if (!existingKeys.has(key)) periods.push({ periodKey: key, from, to, amountMinor });
        cursor = to;
      }
      return periods;
    }

    // Day mode (daily / weekly): one invoice spanning the chosen day range,
    // prorated from the snapshot amount; floor at minChargeMinor.
    const d = Math.max(0, Math.floor(request.days || 0));
    if (d < 1) throw new BadRequestException('days must be at least 1 for this charge');
    const termDays = TERM_DAYS[baseTerm] || 1;
    let totalMinor = Math.round((amountMinor * d) / termDays);
    totalMinor = Math.max(totalMinor, ub.billingType.minChargeMinor || 0);
    // Start the day after any existing coverage, never before today.
    const today = startOfUtcDay(new Date());
    const lastCredit = await this.prisma.prepaymentCredit.findFirst({
      where: { unitBillingId: ub.id }, orderBy: { coverageTo: 'desc' }, select: { coverageTo: true },
    });
    let start = today;
    if (lastCredit && lastCredit.coverageTo.getTime() > today.getTime()) start = startOfUtcDay(lastCredit.coverageTo);
    const to = addUtcDays(start, d);
    return [{ periodKey: `D:${isoDay(start)}_${d}`, from: start, to, amountMinor: totalMinor }];
  }

  private termLabelFor(ub: any, request: { periods?: number; days?: number }): string {
    if (PERIOD_TERMS.has(ub.baseTerm)) {
      const n = Math.max(1, Math.floor(request.periods || 1));
      return `${n} ${termUnitLabel(ub.baseTerm)}${n > 1 ? 's' : ''}`;
    }
    const d = Math.max(1, Math.floor(request.days || 1));
    return `${d} day${d > 1 ? 's' : ''}`;
  }

  /** Dry-run quote for a resident "pay any term" request. */
  async quotePrepay(userId: string, unitBillingId: string, request: { periods?: number; days?: number }) {
    const ub = await this.resolvePrepayUb(userId, unitBillingId);
    const periods = await this.computePrepayPeriods(ub, request);
    const totalMinor = periods.reduce((s, p) => s + p.amountMinor, 0);
    return {
      unitBillingId: ub.id,
      billingTypeName: ub.billingType.name,
      currency: ub.currency,
      mode: PERIOD_TERMS.has(ub.baseTerm) ? 'period' : 'day',
      termLabel: this.termLabelFor(ub, request),
      count: periods.length,
      totalAmount: totalMinor / 100,
      periods: periods.map((p) => ({ periodKey: p.periodKey, from: p.from, to: p.to, amount: p.amountMinor / 100 })),
    };
  }

  /**
   * Materialize a prepay's period invoices from a plan locked at quote time, and
   * record the PrepaymentCredit. Called ONLY on payment success.
   *
   * Idempotent: only periods that don't already have an invoice for this charge
   * are created (the per-unit period unique guarantees no duplicates), and it
   * returns the invoice ids for ALL the plan's periods (pre-existing + new) so
   * the payment can be allocated across them.
   */
  async materializePrepayFromPlan(
    orgId: string,
    plan: { unitBillingId: string; termLabel: string; currency?: string; periods: Array<{ periodKey: string; from: string | Date; to: string | Date; amount: number }> },
    createdBy: string,
  ): Promise<string[]> {
    const ub = await this.prisma.unitBilling.findFirst({
      where: { id: plan.unitBillingId, organizationId: orgId },
      include: { billingType: true },
    });
    if (!ub) throw new NotFoundException('Charge not found');

    const periods = (plan.periods || []).map((p) => ({
      periodKey: p.periodKey,
      from: new Date(p.from),
      to: new Date(p.to),
      amountMinor: Math.round(Number(p.amount) * 100),
    }));
    if (periods.length === 0) return [];
    const periodKeys = periods.map((p) => p.periodKey);

    const orgBaseCcy = (await this.orgCurrency(orgId)).toUpperCase();
    const ccy = (ub.currency || orgBaseCcy).toUpperCase();

    let fxLock: { lockedRate: Decimal; lockedRateAsOf: Date; baseCurrency: string } | null = null;
    if (ccy !== orgBaseCcy) {
      try {
        const locked = await this.fx.lockedRateForInvoice(orgId, ccy, orgBaseCcy, new Date());
        if (locked) fxLock = { lockedRate: locked.rate, lockedRateAsOf: locked.asOfDay, baseCurrency: locked.baseCurrency };
      } catch (err: any) {
        this.logger.warn(`FX lock skipped for prepay ${ub.billingType.name}: ${err.message}`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Which periods already have an invoice for this charge? (idempotency)
      const existing = await tx.invoice.findMany({
        where: { unitBillingId: ub.id, periodKey: { in: periodKeys } },
        select: { periodKey: true },
      });
      const existingKeys = new Set(existing.map((e) => e.periodKey));
      const fresh = periods.filter((p) => !existingKeys.has(p.periodKey));

      if (fresh.length > 0) {
        const numbers = await reserveInvoiceNumbers(tx, orgId, fresh.length);
        const issue = new Date();
        for (let i = 0; i < fresh.length; i += 1) {
          const p = fresh[i];
          const amt = new Decimal(p.amountMinor).div(100);
          await tx.invoice.create({
            data: {
              organizationId: orgId,
              unitId: ub.unitId,
              invoiceNumber: numbers[i],
              type: 'recurring',
              amount: amt,
              originalAmount: amt,
              currency: ccy,
              dueDate: p.from,
              status: 'sent',
              sentAt: issue,
              lineItems: [{ description: `${ub.billingType.name} (${p.periodKey})`, amount: Number(amt.toString()), quantity: 1 }] as any,
              createdBy,
              baseCurrency: fxLock?.baseCurrency ?? null,
              lockedRate: fxLock?.lockedRate ?? null,
              lockedRateAsOf: fxLock?.lockedRateAsOf ?? null,
              billingTypeId: ub.billingTypeId,
              unitBillingId: ub.id,
              periodKey: p.periodKey,
            },
          });
        }
        // Record the prepay span once (only when we actually created invoices).
        const totalMinor = periods.reduce((s, p) => s + p.amountMinor, 0);
        await tx.prepaymentCredit.create({
          data: {
            organizationId: orgId,
            unitBillingId: ub.id,
            coverageFrom: periods[0].from,
            coverageTo: periods[periods.length - 1].to,
            termLabel: plan.termLabel,
            periodKeys,
            amount: new Decimal(totalMinor).div(100),
            currency: ccy,
            createdBy,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: createdBy,
            actorRole: 'resident',
            action: 'prepay_materialized',
            entityType: 'UnitBilling',
            entityId: ub.id,
            changes: { periodKeys, termLabel: plan.termLabel, created: fresh.length, currency: ccy } as any,
          },
        });
      }

      const all = await tx.invoice.findMany({
        where: { unitBillingId: ub.id, periodKey: { in: periodKeys } },
        select: { id: true },
      });
      return all.map((a) => a.id);
    });
  }

  // ---- helpers ----

  async orgCurrency(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { currency: true } });
    return org?.currency || 'ZAR';
  }

  private async assertUnitInOrg(orgId: string, unitId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, estate: { organizationId: orgId } },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');
  }

  private async resolveUnitIds(orgId: string, target: Target): Promise<string[]> {
    if (target.unitIds && target.unitIds.length) {
      const rows = await this.prisma.unit.findMany({
        where: { id: { in: target.unitIds }, estate: { organizationId: orgId } },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }
    const where: Prisma.UnitWhereInput = { estate: { organizationId: orgId } };
    if (target.estateIds && target.estateIds.length) where.estateId = { in: target.estateIds };
    const rows = await this.prisma.unit.findMany({ where, select: { id: true } });
    return rows.map((r) => r.id);
  }

  private audit(
    tx: Prisma.TransactionClient,
    orgId: string,
    actor: Actor,
    action: string,
    entityId: string,
    changes: Record<string, any>,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorId: actor.userId,
        actorRole: actor.role,
        action,
        entityType: 'UnitBilling',
        entityId,
        changes: changes as any,
      },
    });
  }
}
