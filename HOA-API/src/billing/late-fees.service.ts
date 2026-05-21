import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { Actor } from '../common/scope.util';

export type LateFeeTier = {
  ageDays: number;
  kind: 'percent' | 'flat';
  value: number;
  cap?: number;
};

const KINDS: LateFeeTier['kind'][] = ['percent', 'flat'];
const MAX_TIERS = 10;
const ELIGIBLE_INVOICE_STATUSES = ['sent', 'partial', 'overdue'];

/**
 * Phase 1.2 late-fee engine.
 *
 * Operators define tiers like `[{ageDays: 7, kind: 'percent', value: 5, cap: 500}, ...]`.
 * The sweep walks every open invoice past its due date, picks the highest tier
 * whose `ageDays` threshold the invoice has crossed (relative to dueDate +
 * graceDays), computes the surcharge, and bumps the invoice's `amount`.
 *
 * Idempotency: each invoice carries a `lateFeeSignature` that combines the
 * tier picked + period; a re-run with the same signature is a no-op. Bumping
 * the tier (e.g. from "7-day" to "30-day") produces a new signature and
 * applies the *delta* between previous and new fee, never re-charging from
 * scratch.
 */
@Injectable()
export class LateFeesService {
  private readonly logger = new Logger(LateFeesService.name);

  constructor(private prisma: PrismaService) {}

  async getConfig(orgId: string) {
    const row = await this.prisma.lateFeeConfig.findUnique({ where: { organizationId: orgId } });
    return row || null;
  }

  async upsertConfig(
    orgId: string,
    actor: Actor,
    dto: { isActive?: boolean; graceDays?: number; tiers?: LateFeeTier[]; glAccountId?: string | null; notes?: string },
  ) {
    if (dto.graceDays !== undefined && (dto.graceDays < 0 || dto.graceDays > 365)) {
      throw new BadRequestException('graceDays must be 0..365');
    }
    if (dto.tiers) this.validateTiers(dto.tiers);

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.lateFeeConfig.findUnique({ where: { organizationId: orgId } });
      const row = await tx.lateFeeConfig.upsert({
        where: { organizationId: orgId },
        update: {
          isActive: dto.isActive,
          graceDays: dto.graceDays,
          tiers: dto.tiers as any,
          glAccountId: dto.glAccountId,
          notes: dto.notes,
        },
        create: {
          organizationId: orgId,
          isActive: dto.isActive ?? false,
          graceDays: dto.graceDays ?? 0,
          tiers: (dto.tiers || []) as any,
          glAccountId: dto.glAccountId,
          notes: dto.notes,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: before ? 'late_fee_config_updated' : 'late_fee_config_created',
          entityType: 'LateFeeConfig',
          entityId: row.id,
          changes: {
            before: before ? { isActive: before.isActive, graceDays: before.graceDays, tiers: before.tiers } : null,
            after: { isActive: row.isActive, graceDays: row.graceDays, tiers: row.tiers },
          } as any,
        },
      });
      return row;
    });
  }

  /**
   * Dry-run: returns the surcharges we *would* apply, without writing them.
   * Useful for the admin UI's "What would this do?" preview.
   */
  async previewSweep(orgId: string) {
    // Preview is a *read* — return an unconfigured shape instead of 400 so
    // the admin UI can render a "configure your policy" CTA without spamming
    // the console with errors. The mutating `sweep` endpoint still 400s.
    const cfg = await this.prisma.lateFeeConfig.findUnique({ where: { organizationId: orgId } });
    if (!cfg || !cfg.isActive) {
      return {
        configured: false,
        reason: !cfg ? 'no_config' : 'inactive',
        eligibleCount: 0,
        totalDelta: '0.00',
        currency: 'ZAR',
        sample: [],
      };
    }
    if (!cfg.tiers || (cfg.tiers as any[]).length === 0) {
      return {
        configured: false,
        reason: 'no_tiers',
        eligibleCount: 0,
        totalDelta: '0.00',
        currency: 'ZAR',
        sample: [],
      };
    }
    const candidates = await this.findCandidateInvoices(orgId, cfg.graceDays);
    const previews = candidates.map((inv) => this.computeFee(inv, cfg.tiers as any));
    return {
      configured: true,
      eligibleCount: previews.filter((p) => p.delta > 0).length,
      totalDelta: previews.reduce((s, p) => s + p.delta, 0).toFixed(2),
      currency: candidates[0]?.currency || 'ZAR',
      sample: previews.slice(0, 20),
    };
  }

  /**
   * Sweep every open + past-due invoice in the org and apply tier fees.
   * Idempotent — invoice rows already at the right signature stay put.
   * Writes a `lateFeeAppliedAt` timestamp + `lateFeeSignature` so audit logs
   * can trace exactly which tier fired.
   */
  async sweep(orgId: string, actor: Actor) {
    const cfg = await this.requireActiveConfig(orgId);
    const candidates = await this.findCandidateInvoices(orgId, cfg.graceDays);

    let applied = 0; let totalDelta = new Decimal(0); let skipped = 0;
    for (const inv of candidates) {
      const calc = this.computeFee(inv, cfg.tiers as any);
      if (calc.delta <= 0) { skipped++; continue; }
      if (inv.lateFeeSignature === calc.signature) { skipped++; continue; }

      await this.prisma.$transaction(async (tx) => {
        const beforeAmount = inv.amount;
        // CAS — only apply if the row hasn't been mutated under us. Concurrent
        // sweeps + manual edits can't double-charge.
        const row = await tx.invoice.updateMany({
          where: {
            id: inv.id,
            lateFeeSignature: inv.lateFeeSignature ?? null,
            amount: inv.amount, // CAS on amount + sig
          },
          data: {
            amount: new Decimal(calc.newAmount),
            lateFeeAppliedAt: new Date(),
            lateFeeSignature: calc.signature,
          },
        });
        if (row.count === 0) {
          // Lost the CAS race — another worker beat us. Skip.
          return;
        }
        applied++;
        totalDelta = totalDelta.plus(new Decimal(calc.delta));
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'late_fee_applied',
            entityType: 'Invoice',
            entityId: inv.id,
            changes: {
              before: { amount: beforeAmount.toString(), signature: inv.lateFeeSignature },
              after: { amount: calc.newAmount, signature: calc.signature, tier: calc.tier },
              delta: calc.delta,
            } as any,
          },
        });
      });
    }

    await this.prisma.lateFeeConfig.update({
      where: { organizationId: orgId },
      data: { lastSweepAt: new Date() },
    });

    return {
      applied, skipped, totalDelta: totalDelta.toString(),
      currency: candidates[0]?.currency || 'ZAR',
    };
  }

  // ============ Helpers ============

  private async requireActiveConfig(orgId: string) {
    const cfg = await this.prisma.lateFeeConfig.findUnique({ where: { organizationId: orgId } });
    if (!cfg) {
      throw new BadRequestException(
        'No late-fee policy configured. Set up tiers in Finance → Late fees before running a sweep.',
      );
    }
    if (!cfg.isActive) {
      throw new BadRequestException(
        'Late-fee policy is paused. Activate it in Finance → Late fees before running a sweep.',
      );
    }
    if (!cfg.tiers || (cfg.tiers as any[]).length === 0) {
      throw new BadRequestException(
        'Late-fee policy has no tiers. Add at least one tier (e.g. "30 days: 5% surcharge") and save.',
      );
    }
    return cfg;
  }

  private async findCandidateInvoices(orgId: string, graceDays: number) {
    const cutoff = new Date(Date.now() - graceDays * 86400000);
    return this.prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        status: { in: ELIGIBLE_INVOICE_STATUSES },
        dueDate: { lt: cutoff },
      },
      select: {
        id: true, amount: true, originalAmount: true, currency: true, dueDate: true,
        lateFeeSignature: true, invoiceNumber: true,
      },
    });
  }

  /**
   * Returns the new amount, the delta vs current `amount`, and a signature
   * that's stable for (tier, period). Computes against `originalAmount` so
   * stacking tiers don't compound on top of prior fees.
   */
  private computeFee(
    inv: { id: string; amount: Decimal; originalAmount: Decimal | null; dueDate: Date; lateFeeSignature: string | null; currency: string; invoiceNumber: string },
    tiers: LateFeeTier[],
  ): { newAmount: string; delta: number; signature: string; tier: LateFeeTier | null } {
    const ageDays = Math.floor((Date.now() - inv.dueDate.getTime()) / 86400000);
    const sorted = [...tiers].sort((a, b) => a.ageDays - b.ageDays);
    let picked: LateFeeTier | null = null;
    for (const t of sorted) {
      if (ageDays >= t.ageDays) picked = t;
    }
    if (!picked) {
      return { newAmount: inv.amount.toString(), delta: 0, signature: '', tier: null };
    }
    const base = inv.originalAmount ? new Decimal(inv.originalAmount.toString()) : new Decimal(inv.amount.toString());
    let surcharge: Decimal;
    if (picked.kind === 'percent') {
      surcharge = base.times(picked.value).div(100);
    } else {
      surcharge = new Decimal(picked.value);
    }
    if (picked.cap !== undefined && picked.cap > 0 && surcharge.greaterThan(picked.cap)) {
      surcharge = new Decimal(picked.cap);
    }
    const newAmount = base.plus(surcharge);
    const signature = this.signature(picked);
    const delta = newAmount.minus(inv.amount).toNumber();
    return { newAmount: newAmount.toFixed(2), delta, signature, tier: picked };
  }

  private signature(t: LateFeeTier): string {
    const canonical = `tier=${t.ageDays}-${t.kind}-${t.value}-${t.cap ?? ''}`;
    return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  }

  private validateTiers(tiers: LateFeeTier[]) {
    if (!Array.isArray(tiers)) throw new BadRequestException('tiers must be an array');
    if (tiers.length > MAX_TIERS) throw new BadRequestException(`At most ${MAX_TIERS} tiers`);
    let prevAgeDays = -1;
    for (const t of tiers) {
      if (typeof t.ageDays !== 'number' || t.ageDays < 0) throw new BadRequestException('tier.ageDays must be ≥ 0');
      if (t.ageDays <= prevAgeDays) throw new BadRequestException('tiers must be sorted by ageDays asc and unique');
      prevAgeDays = t.ageDays;
      if (!KINDS.includes(t.kind)) throw new BadRequestException(`tier.kind must be one of ${KINDS.join(', ')}`);
      if (typeof t.value !== 'number' || t.value < 0) throw new BadRequestException('tier.value must be ≥ 0');
      if (t.kind === 'percent' && t.value > 100) throw new BadRequestException('percent tier value must be ≤ 100');
      if (t.cap !== undefined && (typeof t.cap !== 'number' || t.cap < 0)) {
        throw new BadRequestException('tier.cap must be ≥ 0 when provided');
      }
    }
  }
}
