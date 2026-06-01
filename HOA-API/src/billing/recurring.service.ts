import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { Actor } from '../common/scope.util';
import { FxService } from '../fx/fx.service';
import { MailService } from '../mail/mail.service';
import { reserveInvoiceNumbers } from '../common/invoice-number';

const FREQUENCIES = ['monthly', 'quarterly', 'annual'] as const;
type Frequency = typeof FREQUENCIES[number];

const MAX_NAME_LEN = 80;
const MAX_LINE_ITEMS = 50;

type LineItem = { description: string; amount: number; quantity?: number };
type UnitFilter = { estateIds?: string[]; tagIn?: string[] };

@Injectable()
export class RecurringInvoicesService {
  private readonly logger = new Logger(RecurringInvoicesService.name);

  constructor(private prisma: PrismaService, private fx: FxService, private mail: MailService) {}

  // ============ CRUD ============

  async list(orgId: string) {
    return this.prisma.recurringInvoiceSchedule.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { invoices: true, runs: true } },
      },
    });
  }

  async findById(orgId: string, id: string) {
    const s = await this.prisma.recurringInvoiceSchedule.findFirst({
      where: { id, organizationId: orgId },
      include: {
        runs: { orderBy: { runAt: 'desc' }, take: 20 },
        _count: { select: { invoices: true } },
      },
    });
    if (!s) throw new NotFoundException('Schedule not found');
    return s;
  }

  async create(
    orgId: string,
    actor: Actor,
    dto: {
      name: string; description?: string; frequency: string; billingDayOfMonth?: number; dueDays?: number;
      amount?: number; currency?: string; lineItems?: LineItem[]; notes?: string; unitFilter?: UnitFilter;
    },
  ) {
    this.validateSchedule(dto);
    const nextRunAt = this.computeNextRun(dto.frequency as Frequency, dto.billingDayOfMonth || 1, null);
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.recurringInvoiceSchedule.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          description: dto.description,
          frequency: dto.frequency,
          billingDayOfMonth: dto.billingDayOfMonth || 1,
          dueDays: dto.dueDays ?? 30,
          amount: dto.amount != null ? new Decimal(dto.amount) : null,
          currency: (dto.currency || 'ZAR').toUpperCase(),
          lineItems: (dto.lineItems || []) as any,
          notes: dto.notes,
          unitFilter: (dto.unitFilter || {}) as any,
          nextRunAt,
          createdBy: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'recurring_schedule_created',
          entityType: 'RecurringInvoiceSchedule',
          entityId: s.id,
          changes: { name: s.name, frequency: s.frequency, amount: dto.amount, lineItems: dto.lineItems } as any,
        },
      });
      return s;
    });
  }

  async update(
    orgId: string,
    actor: Actor,
    id: string,
    dto: {
      name?: string; description?: string; frequency?: string; billingDayOfMonth?: number; dueDays?: number;
      amount?: number; currency?: string; lineItems?: LineItem[]; notes?: string; unitFilter?: UnitFilter;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.recurringInvoiceSchedule.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Schedule not found');
    if (dto.frequency || dto.billingDayOfMonth !== undefined || dto.amount !== undefined || dto.lineItems !== undefined) {
      // Re-validate the merged shape
      this.validateSchedule({
        name: dto.name || existing.name,
        frequency: dto.frequency || existing.frequency,
        billingDayOfMonth: dto.billingDayOfMonth ?? existing.billingDayOfMonth,
        amount: dto.amount ?? (existing.amount ? Number(existing.amount.toString()) : undefined),
        lineItems: dto.lineItems ?? (existing.lineItems as any) ?? [],
      } as any);
    }
    return this.prisma.$transaction(async (tx) => {
      const data: any = {
        name: dto.name,
        description: dto.description,
        frequency: dto.frequency,
        billingDayOfMonth: dto.billingDayOfMonth,
        dueDays: dto.dueDays,
        amount: dto.amount !== undefined ? new Decimal(dto.amount) : undefined,
        currency: dto.currency?.toUpperCase(),
        lineItems: dto.lineItems as any,
        notes: dto.notes,
        unitFilter: dto.unitFilter as any,
        isActive: dto.isActive,
      };
      if (dto.frequency || dto.billingDayOfMonth !== undefined) {
        data.nextRunAt = this.computeNextRun(
          (dto.frequency || existing.frequency) as Frequency,
          dto.billingDayOfMonth ?? existing.billingDayOfMonth,
          existing.lastRunAt,
        );
      }
      const updated = await tx.recurringInvoiceSchedule.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'recurring_schedule_updated',
          entityType: 'RecurringInvoiceSchedule',
          entityId: id,
          changes: { before: this.diffSnapshot(existing), after: this.diffSnapshot(updated) } as any,
        },
      });
      return updated;
    });
  }

  // ============ Run ============

  /**
   * Dry-run a schedule: returns the units it would target + their inferred
   * amounts, without writing invoices. Used by the admin UI's "Preview"
   * button to catch mis-scoped filters before they bill 142 residents.
   */
  async preview(orgId: string, id: string) {
    const s = await this.findById(orgId, id);
    const periodKey = this.currentPeriodKey(s.frequency as Frequency, new Date());
    const targetUnits = await this.resolveTargetUnits(orgId, s.unitFilter as any);
    const existingInvoicesForPeriod = await this.prisma.invoice.findMany({
      where: { parentScheduleId: id, periodKey },
      select: { unitId: true, id: true },
    });
    const alreadyBilledUnitIds = new Set(existingInvoicesForPeriod.map((i) => i.unitId));
    return {
      periodKey,
      totalUnits: targetUnits.length,
      alreadyBilled: existingInvoicesForPeriod.length,
      toBill: targetUnits.length - alreadyBilledUnitIds.size,
      sampleUnits: targetUnits.slice(0, 10).map((u) => ({
        id: u.id,
        unitNumber: u.unitNumber,
        estateName: (u as any).estate?.name,
        alreadyBilled: alreadyBilledUnitIds.has(u.id),
      })),
      amount: s.amount ? s.amount.toString() : this.lineItemsTotal(s.lineItems as any).toString(),
      currency: s.currency,
      lineItems: s.lineItems,
    };
  }

  /**
   * Run a schedule for the current period. Idempotent: invoices are inserted
   * via `createMany({ skipDuplicates: true })` against the
   * (parentScheduleId, unitId, periodKey) unique index, so two cron firings
   * in the same window do not produce duplicates.
   */
  async run(orgId: string, actor: Actor, id: string, opts: { periodOverride?: string } = {}) {
    const s = await this.prisma.recurringInvoiceSchedule.findFirst({
      where: { id, organizationId: orgId, isActive: true },
    });
    if (!s) throw new NotFoundException('Active schedule not found');

    const periodKey = opts.periodOverride || this.currentPeriodKey(s.frequency as Frequency, new Date());
    const targetUnits = await this.resolveTargetUnits(orgId, s.unitFilter as any);
    if (targetUnits.length === 0) {
      return this.recordRun(s.id, orgId, periodKey, actor.userId, 0, 0, 'No matching units');
    }

    // De-dup: pull the unitIds already invoiced for this period.
    const already = await this.prisma.invoice.findMany({
      where: { parentScheduleId: id, periodKey },
      select: { unitId: true },
    });
    const alreadyIds = new Set(already.map((i) => i.unitId));
    const fresh = targetUnits.filter((u) => !alreadyIds.has(u.id));

    if (fresh.length === 0) {
      return this.recordRun(s.id, orgId, periodKey, actor.userId, 0, targetUnits.length, 'All units already billed for period');
    }

    // Resolve FX lock once for the whole batch.
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { currency: true },
    });
    const invoiceCcy = (s.currency || org.currency || 'ZAR').toUpperCase();
    const orgBaseCcy = (org.currency || 'ZAR').toUpperCase();
    let lockedRate: Decimal | null = null;
    let lockedRateAsOf: Date | null = null;
    let baseCurrency: string | null = null;
    if (invoiceCcy !== orgBaseCcy) {
      try {
        const locked = await this.fx.lockedRateForInvoice(orgId, invoiceCcy, orgBaseCcy, new Date());
        if (locked) {
          lockedRate = locked.rate; lockedRateAsOf = locked.asOfDay; baseCurrency = locked.baseCurrency;
        }
      } catch (err: any) {
        this.logger.warn(`FX lock skipped for schedule ${id}: ${err.message}`);
      }
    }

    const baseAmount = s.amount
      ? new Decimal(s.amount.toString())
      : this.lineItemsTotal(s.lineItems as any);

    // Every generated invoice MUST carry at least one line item (org policy —
    // an empty-line-item invoice is never allowed). Legacy amount-only
    // schedules get a single synthesized line from the schedule name + amount.
    const scheduleLineItems = (s.lineItems as any[]) || [];
    const genLineItems = scheduleLineItems.length > 0
      ? scheduleLineItems
      : [{ description: s.name, amount: Number(baseAmount.toString()), quantity: 1 }];

    // Reserve a contiguous block of invoice numbers from the per-org sequence.
    return this.prisma.$transaction(async (tx) => {
      const invoiceNumbers = await reserveInvoiceNumbers(tx, orgId, fresh.length);
      const issueDate = new Date();
      const dueDate = new Date(issueDate.getTime() + (s.dueDays ?? 30) * 86400000);

      const inserts = fresh.map((u, i) => ({
        organizationId: orgId,
        unitId: u.id,
        invoiceNumber: invoiceNumbers[i],
        type: 'recurring',
        amount: baseAmount,
        originalAmount: baseAmount,
        currency: invoiceCcy,
        dueDate,
        status: 'sent',
        sentAt: issueDate,
        lineItems: genLineItems as any,
        notes: s.notes,
        createdBy: actor.userId,
        baseCurrency, lockedRate, lockedRateAsOf,
        parentScheduleId: s.id,
        periodKey,
      }));

      // skipDuplicates handles late-arriving collisions from a concurrent run.
      const result = await tx.invoice.createMany({ data: inserts as any, skipDuplicates: true });

      await tx.recurringInvoiceSchedule.update({
        where: { id: s.id },
        data: {
          lastRunAt: issueDate,
          nextRunAt: this.computeNextRun(s.frequency as Frequency, s.billingDayOfMonth, issueDate),
        },
      });

      const runRow = await tx.recurringScheduleRun.create({
        data: {
          scheduleId: s.id,
          organizationId: orgId,
          periodKey,
          triggeredBy: actor.userId,
          createdInvoices: result.count,
          skippedDuplicates: targetUnits.length - result.count,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'recurring_schedule_run',
          entityType: 'RecurringInvoiceSchedule',
          entityId: s.id,
          changes: { periodKey, createdInvoices: result.count, skippedDuplicates: targetUnits.length - result.count } as any,
        },
      });

      return runRow;
    }).then(async (runRow) => {
      // Phase 2.2: queue invoice-issued emails AFTER the transaction commits
      // so the invoice rows are visible via the public Prisma client. The
      // queueInvoiceIssuedEmails query uses `this.prisma`, which sees only
      // committed state — calling it inside the tx returned 0 rows.
      this.queueInvoiceIssuedEmails(orgId, s.id, periodKey).catch((err) => {
        this.logger.warn(`queueInvoiceIssuedEmails failed for schedule ${s.id}: ${err.message}`);
      });
      return runRow;
    });
  }

  /** Cron-driven sweep — runs every due schedule across the org. */
  async runDueSchedules(orgId: string, actor: Actor) {
    const due = await this.prisma.recurringInvoiceSchedule.findMany({
      where: { organizationId: orgId, isActive: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }] },
    });
    const results: any[] = [];
    for (const s of due) {
      try { results.push(await this.run(orgId, actor, s.id)); }
      catch (err: any) {
        this.logger.warn(`run schedule ${s.id} failed: ${err.message}`);
        results.push({ scheduleId: s.id, error: err.message });
      }
    }
    return { processed: results.length, results };
  }

  // ============ Helpers ============

  /**
   * Phase 2.2: enqueue an `invoice_issued` email for every invoice generated
   * by this run. The unique dedup index on EmailDelivery prevents double-send
   * if the schedule re-runs (or if the cron + manual trigger both fire).
   */
  private async queueInvoiceIssuedEmails(orgId: string, scheduleId: string, periodKey: string) {
    const invs = await this.prisma.invoice.findMany({
      where: { parentScheduleId: scheduleId, periodKey, organizationId: orgId },
      include: {
        unit: {
          include: {
            estate: { select: { name: true } },
            occupancies: { where: { isActive: true }, include: { person: true } },
          },
        },
      },
    });
    const payBase = process.env.RESIDENT_BASE_URL || 'http://localhost:3002';
    for (const inv of invs) {
      // Person has userId but no direct relation; look up the user separately.
      const personWithUserId = inv.unit.occupancies
        .map((o) => o.person)
        .find((p) => p?.userId);
      if (!personWithUserId?.userId) continue;
      const user = await this.prisma.user.findUnique({
        where: { id: personWithUserId.userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      if (!user?.email) continue;
      const amount = Number(inv.amount.toString()).toLocaleString();
      try {
        await this.mail.enqueue({
          organizationId: orgId,
          templateKey: 'invoice_issued',
          data: {
            recipientFirstName: user.firstName,
            invoiceNumber: inv.invoiceNumber,
            amountFormatted: `${amount} ${inv.currency}`,
            dueDateFormatted: inv.dueDate.toISOString().slice(0, 10),
            estateName: inv.unit.estate.name,
            unitNumber: inv.unit.unitNumber,
            payUrl: `${payBase}/invoices/${inv.id}`,
          },
          to: user.email,
          toName: `${user.firstName} ${user.lastName}`,
          toUserId: user.id,
          entityType: 'Invoice',
          entityId: inv.id,
        });
      } catch (err: any) {
        this.logger.warn(`invoice_issued enqueue failed for ${inv.id}: ${err.message}`);
      }
    }
  }

  private validateSchedule(dto: { name: string; frequency: string; billingDayOfMonth?: number; amount?: number; lineItems?: LineItem[]; dueDays?: number }) {
    if (!dto.name || dto.name.length > MAX_NAME_LEN) throw new BadRequestException('name is required (≤80 chars)');
    if (!FREQUENCIES.includes(dto.frequency as any)) {
      throw new BadRequestException(`frequency must be one of ${FREQUENCIES.join(', ')}`);
    }
    if (dto.billingDayOfMonth !== undefined && (dto.billingDayOfMonth < 1 || dto.billingDayOfMonth > 31)) {
      throw new BadRequestException('billingDayOfMonth must be 1..31');
    }
    if (dto.dueDays !== undefined && (dto.dueDays < 0 || dto.dueDays > 180)) {
      throw new BadRequestException('dueDays must be 0..180');
    }
    const hasAmount = dto.amount !== undefined && dto.amount !== null;
    const hasLineItems = dto.lineItems && dto.lineItems.length > 0;
    if (!hasAmount && !hasLineItems) {
      throw new BadRequestException('Either amount or lineItems must be set');
    }
    if (hasAmount && dto.amount! < 0) throw new BadRequestException('amount must be ≥ 0');
    if (hasLineItems) {
      if (dto.lineItems!.length > MAX_LINE_ITEMS) throw new BadRequestException(`At most ${MAX_LINE_ITEMS} line items`);
      for (const li of dto.lineItems!) {
        if (typeof li.amount !== 'number' || li.amount < 0) {
          throw new BadRequestException('Each line item must have a non-negative amount');
        }
        if (!li.description || li.description.length > 200) {
          throw new BadRequestException('Each line item must have a description (≤200 chars)');
        }
      }
    }
  }

  private lineItemsTotal(items: LineItem[]): Decimal {
    let total = new Decimal(0);
    for (const li of items || []) {
      const qty = li.quantity ?? 1;
      total = total.plus(new Decimal(li.amount).times(qty));
    }
    return total;
  }

  private currentPeriodKey(freq: Frequency, when: Date): string {
    const y = when.getUTCFullYear();
    const m = when.getUTCMonth() + 1;
    if (freq === 'monthly') return `${y}-${String(m).padStart(2, '0')}`;
    if (freq === 'quarterly') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    return `${y}`;
  }

  private computeNextRun(freq: Frequency, day: number, lastRunAt: Date | null): Date {
    const base = lastRunAt ? new Date(lastRunAt) : new Date();
    const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    if (freq === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
    else if (freq === 'quarterly') next.setUTCMonth(next.getUTCMonth() + 3);
    else next.setUTCFullYear(next.getUTCFullYear() + 1);
    // Clamp day to month length (Feb 30 → Feb 28/29).
    const lastDayOfMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDayOfMonth));
    return next;
  }

  private async resolveTargetUnits(orgId: string, filter: UnitFilter) {
    const where: any = { estate: { organizationId: orgId } };
    if (filter?.estateIds && filter.estateIds.length > 0) {
      where.estateId = { in: filter.estateIds };
    }
    if (filter?.tagIn && filter.tagIn.length > 0) {
      where.tags = { hasSome: filter.tagIn };
    }
    return this.prisma.unit.findMany({
      where,
      select: { id: true, unitNumber: true, estate: { select: { name: true } } },
    });
  }

  private async recordRun(scheduleId: string, orgId: string, periodKey: string, userId: string, created: number, skipped: number, errorMessage?: string) {
    return this.prisma.recurringScheduleRun.create({
      data: { scheduleId, organizationId: orgId, periodKey, triggeredBy: userId, createdInvoices: created, skippedDuplicates: skipped, errorMessage },
    });
  }

  private diffSnapshot(s: any) {
    return {
      name: s.name, frequency: s.frequency, billingDayOfMonth: s.billingDayOfMonth,
      dueDays: s.dueDays, amount: s.amount?.toString(), currency: s.currency,
      isActive: s.isActive, unitFilter: s.unitFilter,
    };
  }
}
