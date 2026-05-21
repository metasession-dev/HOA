import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';

export type Actor = { userId: string; role: string };

type CollectedAnomaly = {
  type: string;
  severity: string;
  entityType?: string;
  entityId?: string;
  description: string;
  metrics: any;
  signature: string;
};

/**
 * Heuristic anomaly detection over existing financial data. Runs on demand
 * (admin button + nightly cron in Phase 2.1 worker). Each detector returns
 * zero or more anomalies with a deterministic `signature` so a re-run of the
 * same input window doesn't create duplicates.
 *
 * Detectors implemented:
 *   - arrears_spike — current-month arrears > 1.5× trailing-3-month avg
 *   - vendor_invoice_deviation — single invoice > 2× vendor's trailing avg
 *   - duplicate_payment — same vendor+amount within 7 days
 *   - cash_flow_shortfall — projected next-30-day outflows > current cash
 *
 * Signatures bucket per-period so we don't fire the same alert daily.
 */

const PCT_SPIKE = 1.5;
const VENDOR_DEVIATION = 2.0;

@Injectable()
export class AnomalyService {
  constructor(private prisma: PrismaService) {}

  async list(
    orgId: string,
    query: { severity?: string; type?: string; status?: 'open' | 'acknowledged' | 'dismissed' | 'all' },
  ) {
    const where: any = { organizationId: orgId };
    if (query.severity) where.severity = query.severity;
    if (query.type) where.type = query.type;
    if (query.status === 'acknowledged') where.acknowledgedAt = { not: null };
    else if (query.status === 'dismissed') where.dismissedAt = { not: null };
    else if (query.status === 'open' || !query.status) {
      where.acknowledgedAt = null;
      where.dismissedAt = null;
    }
    return this.prisma.anomalyDetection.findMany({
      where,
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
      take: 200,
    });
  }

  async acknowledge(id: string, orgId: string, actor: Actor) {
    return this.transitionAnomaly(id, orgId, actor, 'acknowledged');
  }

  async dismiss(id: string, orgId: string, actor: Actor, reason?: string) {
    return this.transitionAnomaly(id, orgId, actor, 'dismissed', reason);
  }

  private async transitionAnomaly(
    id: string,
    orgId: string,
    actor: Actor,
    action: 'acknowledged' | 'dismissed',
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const anom = await tx.anomalyDetection.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!anom) throw new NotFoundException('Anomaly not found');
      if (anom.dismissedAt) throw new ConflictException('Anomaly already dismissed');
      if (action === 'acknowledged' && anom.acknowledgedAt) {
        throw new ConflictException('Anomaly already acknowledged');
      }
      const data: any = {};
      if (action === 'acknowledged') {
        data.acknowledgedAt = new Date();
        data.acknowledgedBy = actor.userId;
      } else {
        data.dismissedAt = new Date();
        data.dismissedBy = actor.userId;
        if (reason) data.dismissedReason = reason;
      }
      const updated = await tx.anomalyDetection.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: action === 'acknowledged' ? 'anomaly_acknowledged' : 'anomaly_dismissed',
          entityType: 'AnomalyDetection',
          entityId: id,
          changes: { type: anom.type, reason: reason ?? null } as any,
        },
      });
      return updated;
    });
  }

  /**
   * Run all detectors. Idempotent per (signature). Returns the count of new
   * anomalies created in this run (existing-signature matches are skipped via
   * the unique constraint and counted as duplicates).
   */
  async runDetectors(orgId: string, actor: Actor): Promise<{ created: number; skippedDuplicates: number; byType: Record<string, number> }> {
    const collected: Array<{ type: string; severity: string; entityType?: string; entityId?: string; description: string; metrics: any; signature: string }> = [];

    collected.push(...(await this.detectArrearsSpike(orgId)));
    collected.push(...(await this.detectVendorInvoiceDeviation(orgId)));
    collected.push(...(await this.detectDuplicatePayments(orgId)));
    collected.push(...(await this.detectCashFlowShortfall(orgId)));

    let created = 0;
    let skippedDuplicates = 0;
    const byType: Record<string, number> = {};
    for (const a of collected) {
      try {
        await this.prisma.anomalyDetection.create({
          data: {
            organizationId: orgId,
            type: a.type,
            severity: a.severity,
            entityType: a.entityType,
            entityId: a.entityId,
            description: a.description,
            metrics: a.metrics,
            signature: a.signature,
          },
        });
        created++;
        byType[a.type] = (byType[a.type] ?? 0) + 1;
      } catch (err: any) {
        if (err?.code === 'P2002') {
          skippedDuplicates++;
        } else {
          throw err;
        }
      }
    }

    if (created > 0) {
      await this.prisma.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'anomaly_detector_run',
          entityType: 'AnomalyDetection',
          entityId: 'batch',
          changes: { created, skippedDuplicates, byType } as any,
        },
      });
    }
    return { created, skippedDuplicates, byType };
  }

  // ============== Detectors ==============

  private async detectArrearsSpike(orgId: string) {
    // Compare current-month overdue total vs trailing 3 months average.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const trailingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));

    const overdueRows = await this.prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['sent', 'partial', 'overdue'] },
        dueDate: { lt: now },
      },
      select: { id: true, amount: true, dueDate: true },
    });
    const payments = await this.prisma.payment.findMany({
      where: { status: 'completed', invoice: { organizationId: orgId } },
      select: { invoiceId: true, amount: true },
    });
    const paidByInvoice = new Map<string, Decimal>();
    for (const p of payments) {
      paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? new Decimal(0)).add(new Decimal(p.amount.toString())));
    }
    let currentMonthArrears = new Decimal(0);
    let trailingArrears = new Decimal(0);
    let trailingMonthCount = 0;
    const monthBuckets = new Map<string, Decimal>();
    for (const inv of overdueRows) {
      const paid = paidByInvoice.get(inv.id) ?? new Decimal(0);
      const remaining = new Decimal(inv.amount.toString()).minus(paid);
      if (remaining.lessThanOrEqualTo(0)) continue;
      const bucket = `${inv.dueDate.getUTCFullYear()}-${String(inv.dueDate.getUTCMonth() + 1).padStart(2, '0')}`;
      monthBuckets.set(bucket, (monthBuckets.get(bucket) ?? new Decimal(0)).add(remaining));
      if (inv.dueDate >= monthStart) currentMonthArrears = currentMonthArrears.add(remaining);
      else if (inv.dueDate >= trailingStart) trailingArrears = trailingArrears.add(remaining);
    }
    // count distinct trailing months
    for (const k of monthBuckets.keys()) {
      const [y, m] = k.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1, 1));
      if (d >= trailingStart && d < monthStart) trailingMonthCount++;
    }
    const trailingAvg = trailingMonthCount > 0 ? trailingArrears.div(trailingMonthCount) : new Decimal(0);
    const out: CollectedAnomaly[] = [];
    if (trailingAvg.gt(0) && currentMonthArrears.gt(trailingAvg.times(PCT_SPIKE))) {
      const sig = `arrears_spike:${orgId}:${monthStart.toISOString().slice(0, 7)}`;
      out.push({
        type: 'arrears_spike',
        severity: 'critical',
        description: `Current-month arrears (${currentMonthArrears.toFixed(2)}) exceed 1.5× the trailing 3-month average (${trailingAvg.toFixed(2)}).`,
        metrics: {
          currentMonthArrears: Number(currentMonthArrears.toFixed(2)),
          trailingAvg: Number(trailingAvg.toFixed(2)),
          ratio: Number(currentMonthArrears.div(trailingAvg).toFixed(2)),
        },
        signature: sig,
      });
    }
    return out;
  }

  private async detectVendorInvoiceDeviation(orgId: string) {
    const since = new Date(Date.now() - 90 * 86400000);
    const recent = await this.prisma.vendorInvoice.findMany({
      where: { organizationId: orgId, createdAt: { gte: since } },
      select: { id: true, vendorId: true, amount: true, vendor: { select: { name: true } }, vendorInvoiceNo: true },
    });
    const byVendor = new Map<string, { name: string; total: Decimal; count: number; invoices: typeof recent }>();
    for (const inv of recent) {
      const e = byVendor.get(inv.vendorId) ?? { name: inv.vendor.name, total: new Decimal(0), count: 0, invoices: [] };
      e.total = e.total.add(new Decimal(inv.amount.toString()));
      e.count++;
      e.invoices.push(inv);
      byVendor.set(inv.vendorId, e);
    }
    const out: CollectedAnomaly[] = [];
    for (const [vendorId, e] of byVendor) {
      if (e.count < 3) continue; // need a baseline
      const avg = e.total.div(e.count);
      for (const inv of e.invoices) {
        const amt = new Decimal(inv.amount.toString());
        if (amt.gt(avg.times(VENDOR_DEVIATION))) {
          out.push({
            type: 'vendor_invoice_deviation',
            severity: 'warning',
            entityType: 'VendorInvoice',
            entityId: inv.id,
            description: `${e.name} invoice ${inv.vendorInvoiceNo} (${amt.toFixed(2)}) exceeds 2× vendor's 90-day average (${avg.toFixed(2)}).`,
            metrics: {
              amount: Number(amt.toFixed(2)),
              vendorAverage: Number(avg.toFixed(2)),
              ratio: Number(amt.div(avg).toFixed(2)),
              sampleSize: e.count,
            },
            signature: `vendor_deviation:${orgId}:${inv.id}`,
          });
        }
      }
    }
    return out;
  }

  private async detectDuplicatePayments(orgId: string) {
    // Same vendor + same amount within a 7-day window on captured/approved/paid invoices.
    const since = new Date(Date.now() - 60 * 86400000);
    const recent = await this.prisma.vendorInvoice.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: since },
        status: { in: ['captured', 'pending_approval', 'approved', 'paid'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, vendorId: true, amount: true, createdAt: true, vendor: { select: { name: true } }, vendorInvoiceNo: true },
    });
    const out: CollectedAnomaly[] = [];
    for (let i = 0; i < recent.length; i++) {
      const a = recent[i];
      for (let j = i + 1; j < recent.length; j++) {
        const b = recent[j];
        if (b.vendorId !== a.vendorId) continue;
        if (!new Decimal(a.amount.toString()).equals(new Decimal(b.amount.toString()))) continue;
        const days = (b.createdAt.getTime() - a.createdAt.getTime()) / 86400000;
        if (days > 7) break; // sorted ascending — no more matches for `a`
        const sig = `duplicate_payment:${orgId}:${a.id}:${b.id}`;
        out.push({
          type: 'duplicate_payment',
          severity: 'critical',
          entityType: 'VendorInvoice',
          entityId: b.id,
          description: `Potential duplicate: ${a.vendor.name} invoices ${a.vendorInvoiceNo} and ${b.vendorInvoiceNo} share amount (${new Decimal(a.amount.toString()).toFixed(2)}) within ${days.toFixed(1)} days.`,
          metrics: {
            firstInvoiceId: a.id, secondInvoiceId: b.id,
            amount: Number(new Decimal(a.amount.toString()).toFixed(2)),
            daysApart: Number(days.toFixed(1)),
          },
          signature: sig,
        });
      }
    }
    return out;
  }

  private async detectCashFlowShortfall(orgId: string) {
    // Project next-30-day outflows from approved+pending vendor invoices vs
    // current bank account balances (sum of openings + transactions).
    const accounts = await this.prisma.bankAccount.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, openingBalance: true, currency: true },
    });
    const txns = await this.prisma.bankTransaction.groupBy({
      by: ['bankAccountId'],
      where: { bankAccount: { organizationId: orgId } },
      _sum: { amount: true },
    });
    const sumByAcct = new Map(txns.map((t) => [t.bankAccountId, new Decimal(t._sum.amount?.toString() ?? '0')]));
    let cashOnHand = new Decimal(0);
    for (const a of accounts) {
      cashOnHand = cashOnHand.add(new Decimal(a.openingBalance.toString())).add(sumByAcct.get(a.id) ?? new Decimal(0));
    }

    const upcoming = await this.prisma.vendorInvoice.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['pending_approval', 'approved'] },
        dueDate: { lte: new Date(Date.now() + 30 * 86400000) },
      },
      select: { amount: true },
    });
    const expectedOutflow = upcoming.reduce((s, i) => s.add(new Decimal(i.amount.toString())), new Decimal(0));

    const out: CollectedAnomaly[] = [];
    if (expectedOutflow.gt(cashOnHand)) {
      out.push({
        type: 'cash_flow_shortfall',
        severity: 'critical',
        description: `Next-30-day vendor outflows (${expectedOutflow.toFixed(2)}) exceed current cash on hand (${cashOnHand.toFixed(2)}).`,
        metrics: {
          cashOnHand: Number(cashOnHand.toFixed(2)),
          expectedOutflow: Number(expectedOutflow.toFixed(2)),
          shortfall: Number(expectedOutflow.minus(cashOnHand).toFixed(2)),
        },
        signature: `cash_flow_shortfall:${orgId}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    return out;
  }
}
