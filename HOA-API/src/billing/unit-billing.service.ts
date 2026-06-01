import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { Actor } from '../common/scope.util';

type Target = { unitIds?: string[]; estateIds?: string[] };

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
  constructor(private prisma: PrismaService) {}

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
