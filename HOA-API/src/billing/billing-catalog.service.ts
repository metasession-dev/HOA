import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { Actor } from '../common/scope.util';

/**
 * Billing catalog (Phase 1 of unit-default-billing — see
 * HOA-DOCS/SPEC-unit-default-billing.md).
 *
 * A per-org catalog of recurring charge types (water, service charge, association
 * dues, …). Each entry carries a canonical price understood per `baseTerm`; later
 * phases attach these to units (UnitBilling), generate per-period invoices, and
 * let residents prepay arbitrary terms. This phase is pure CRUD over the catalog.
 *
 * `key` is a stable, immutable slug used for dedupe + reporting. Entries are
 * soft-archived (`isActive = false`), never hard-deleted, so historical
 * attachments/invoices keep a valid reference.
 */
@Injectable()
export class BillingCatalogService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string) {
    return this.prisma.billingType.findMany({
      where: { organizationId: orgId },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(
    orgId: string,
    actor: Actor,
    dto: {
      key?: string;
      name: string;
      description?: string;
      defaultAmount: number;
      baseTerm: string;
      currency?: string | null;
      prorationMode?: string;
      roundingMode?: string;
      minChargeMinor?: number;
      allowResidentPrepay?: boolean;
      attachByDefault?: boolean;
      glAccountId?: string | null;
      sortOrder?: number;
    },
  ) {
    const key = await this.resolveKey(orgId, dto.key, dto.name);

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.billingType.create({
        data: {
          organizationId: orgId,
          key,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          defaultAmount: new Prisma.Decimal(dto.defaultAmount),
          baseTerm: dto.baseTerm,
          currency: dto.currency ? dto.currency.toUpperCase() : null,
          prorationMode: dto.prorationMode ?? 'whole_period',
          roundingMode: dto.roundingMode ?? 'half_up',
          minChargeMinor: dto.minChargeMinor ?? 0,
          allowResidentPrepay: dto.allowResidentPrepay ?? true,
          attachByDefault: dto.attachByDefault ?? true,
          glAccountId: dto.glAccountId || null,
          sortOrder: dto.sortOrder ?? 0,
          createdBy: actor.userId,
        },
      });
      await this.audit(tx, orgId, actor, 'billing_type_created', row.id, { after: this.snapshot(row) });
      return row;
    });
  }

  async update(
    orgId: string,
    actor: Actor,
    id: string,
    dto: Record<string, any>,
  ) {
    const existing = await this.prisma.billingType.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Billing type not found');

    // `key` is immutable; ignore it if a client sends one.
    const data: Prisma.BillingTypeUpdateInput = {};
    if (dto.name !== undefined) data.name = String(dto.name).trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.defaultAmount !== undefined) data.defaultAmount = new Prisma.Decimal(dto.defaultAmount);
    if (dto.baseTerm !== undefined) data.baseTerm = dto.baseTerm;
    if (dto.currency !== undefined) data.currency = dto.currency ? String(dto.currency).toUpperCase() : null;
    if (dto.prorationMode !== undefined) data.prorationMode = dto.prorationMode;
    if (dto.roundingMode !== undefined) data.roundingMode = dto.roundingMode;
    if (dto.minChargeMinor !== undefined) data.minChargeMinor = dto.minChargeMinor;
    if (dto.allowResidentPrepay !== undefined) data.allowResidentPrepay = dto.allowResidentPrepay;
    if (dto.attachByDefault !== undefined) data.attachByDefault = dto.attachByDefault;
    if (dto.glAccountId !== undefined) data.glAccountId = dto.glAccountId || null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.billingType.update({ where: { id }, data });
      await this.audit(tx, orgId, actor, 'billing_type_updated', row.id, {
        before: this.snapshot(existing),
        after: this.snapshot(row),
      });
      return row;
    });
  }

  /** Soft-archive (isActive = false). Kept, never hard-deleted, so references survive. */
  async archive(orgId: string, actor: Actor, id: string) {
    const existing = await this.prisma.billingType.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Billing type not found');

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.billingType.update({ where: { id }, data: { isActive: false } });
      await this.audit(tx, orgId, actor, 'billing_type_archived', row.id, { before: this.snapshot(existing) });
      return row;
    });
  }

  // ---- helpers ----

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50);
  }

  /** Resolve a unique slug within the org. An explicit colliding key is rejected;
   *  a name-derived collision gets a numeric suffix. */
  private async resolveKey(orgId: string, explicit: string | undefined, name: string): Promise<string> {
    if (explicit && explicit.trim()) {
      const key = this.slugify(explicit);
      if (!key) throw new BadRequestException('key must contain at least one letter or digit');
      const clash = await this.prisma.billingType.findUnique({
        where: { organizationId_key: { organizationId: orgId, key } },
      });
      if (clash) throw new BadRequestException(`A billing type with key "${key}" already exists`);
      return key;
    }
    const base = this.slugify(name) || 'charge';
    let candidate = base;
    let n = 1;
    // Loop until free — bounded by how many same-named types an org realistically has.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await this.prisma.billingType.findUnique({
        where: { organizationId_key: { organizationId: orgId, key: candidate } },
      });
      if (!clash) return candidate;
      n += 1;
      candidate = `${base}_${n}`.slice(0, 50);
    }
  }

  private snapshot(row: any) {
    return {
      key: row.key,
      name: row.name,
      defaultAmount: row.defaultAmount?.toString?.() ?? row.defaultAmount,
      baseTerm: row.baseTerm,
      currency: row.currency,
      prorationMode: row.prorationMode,
      attachByDefault: row.attachByDefault,
      allowResidentPrepay: row.allowResidentPrepay,
      isActive: row.isActive,
    };
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
        entityType: 'BillingType',
        entityId,
        changes: changes as any,
      },
    });
  }
}
