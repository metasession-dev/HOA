import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse } from '../common/dto';
import { UnitBillingService } from '../billing/unit-billing.service';

const ACQUISITION_METHODS = ['initial', 'purchase', 'transfer', 'inheritance', 'gift', 'other'] as const;
const GENDERS = ['male', 'female', 'other', 'undisclosed'] as const;
const RELATIONSHIPS = ['spouse', 'partner', 'child', 'parent', 'sibling', 'relative', 'domestic_staff', 'other'] as const;
const AGE_GROUPS = ['infant', 'child', 'teenager', 'adult', 'senior'] as const;

@Injectable()
export class UnitsService {
  constructor(
    private prisma: PrismaService,
    private unitBilling: UnitBillingService,
  ) {}

  /**
   * Org-level unit list — every unit across the organization's estate(s).
   * Because an enterprise has a single estate, this is the primary "Units"
   * surface in the admin app. Includes the active owner + active occupant so
   * the list can show ownership and occupancy at a glance.
   */
  async findAllForOrg(orgId: string, query: PaginationDto & { estateId?: string }) {
    const { page = 1, limit = 50, search, estateId } = query as PaginationDto & { estateId?: string };
    const where: any = { estate: { organizationId: orgId } };
    if (estateId) where.estateId = estateId;
    if (search) {
      where.OR = [
        { unitNumber: { contains: search, mode: 'insensitive' } },
        { block: { contains: search, mode: 'insensitive' } },
        { street: { contains: search, mode: 'insensitive' } },
        { occupancies: { some: { isActive: true, person: { OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ] } } } },
        { ownerships: { some: { isActive: true, person: { OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ] } } } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        include: {
          estate: { select: { id: true, name: true } },
          occupancies: {
            where: { isActive: true },
            include: { person: { select: { id: true, firstName: true, lastName: true, type: true } } },
          },
          ownerships: {
            where: { isActive: true },
            include: { person: { select: { id: true, firstName: true, lastName: true, type: true } } },
          },
          _count: { select: { invoices: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ block: 'asc' }, { street: 'asc' }, { unitNumber: 'asc' }],
      }),
      this.prisma.unit.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async findByEstate(estateId: string, query: PaginationDto, orgId?: string) {
    const { page = 1, limit = 50, search } = query;
    // When an orgId is supplied (all HTTP callers do), scope by it so an
    // estate id from another org can't be used to read its units.
    const where: any = { estateId, ...(orgId ? { estate: { organizationId: orgId } } : {}) };
    if (search) {
      where.OR = [
        { unitNumber: { contains: search, mode: 'insensitive' } },
        { block: { contains: search, mode: 'insensitive' } },
        { street: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        include: {
          occupancies: { where: { isActive: true }, include: { person: true } },
          ownerships: { where: { isActive: true }, include: { person: true } },
          _count: { select: { invoices: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ block: 'asc' }, { unitNumber: 'asc' }],
      }),
      this.prisma.unit.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async findById(id: string, orgId?: string) {
    // Scope to the requesting org so a tenant of one HOA can't pull a unit
    // detail from a different HOA by guessing the id. The orgId is
    // intentionally optional so internal callers (which may already be
    // scoped) can call without re-asserting.
    const personSelect = {
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, type: true, photoUrl: true },
    };
    const unit = await this.prisma.unit.findFirst({
      where: {
        id,
        ...(orgId ? { estate: { organizationId: orgId } } : {}),
      },
      include: {
        estate: true,
        occupancies: {
          orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
          include: { person: personSelect },
        },
        ownerships: {
          orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
          include: { person: personSelect },
        },
        additionalOccupants: {
          orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        },
        invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  async create(estateId: string, data: any, ctx?: { orgId: string; userId: string }) {
    const unitNumber = (data.unitNumber ?? '').toString().trim();
    if (!unitNumber) {
      throw new BadRequestException('unitNumber is required');
    }
    // Normalise block + street + floor — empty strings get coerced to null so
    // the uniqueness comparison below treats "no block" consistently across
    // submissions (whether the client sends "", undefined, or null).
    const block = data.block === '' || data.block == null ? null : String(data.block).trim();
    const street = data.street === '' || data.street == null ? null : String(data.street).trim();
    const floor =
      data.floor === '' || data.floor == null || Number.isNaN(Number(data.floor))
        ? null
        : Number(data.floor);

    await this.ensureUnitIdentityFree(estateId, { unitNumber, block, floor });

    const { ownerPersonId, ...rest } = data;

    // Resolve the org from the estate so we can auto-attach the org's default
    // billing types (Phase 2 of unit-default-billing). When ctx is supplied we
    // verify the estate belongs to that org; otherwise we trust the estate.
    const estate = await this.prisma.estate.findUnique({
      where: { id: estateId },
      select: { organizationId: true },
    });
    if (!estate) throw new NotFoundException('Estate not found');
    const orgId = estate.organizationId;
    if (ctx?.orgId && ctx.orgId !== orgId) throw new ForbiddenException('Estate not in your organization');
    const orgCurrency = await this.unitBilling.orgCurrency(orgId);

    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.create({
        data: { estateId, ...rest, unitNumber, block, street, floor },
      });
      await this.unitBilling.attachDefaults(tx, {
        orgId,
        unitId: unit.id,
        orgCurrency,
        createdBy: ctx?.userId || 'system',
      });
      return unit;
    });
  }

  async update(id: string, data: any) {
    // If the update touches any identity field, re-check uniqueness against
    // the rest of the estate (excluding the row being updated).
    const touchesIdentity =
      data.unitNumber !== undefined || data.block !== undefined || data.floor !== undefined;
    if (data.street !== undefined) {
      data = { ...data, street: data.street === '' || data.street === null ? null : String(data.street).trim() };
    }
    if (touchesIdentity) {
      const current = await this.prisma.unit.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Unit not found');
      const unitNumber =
        data.unitNumber !== undefined ? String(data.unitNumber).trim() : current.unitNumber;
      const block =
        data.block === '' || data.block === null
          ? null
          : data.block !== undefined
          ? String(data.block).trim()
          : current.block;
      const floor =
        data.floor === '' || data.floor === null
          ? null
          : data.floor !== undefined
          ? Number(data.floor)
          : current.floor;
      await this.ensureUnitIdentityFree(current.estateId, { unitNumber, block, floor, excludeId: id });
      data = { ...data, unitNumber, block, floor };
    }
    return this.prisma.unit.update({ where: { id }, data });
  }

  // ==================== OWNERSHIP (title chain) ====================

  /**
   * Assign or transfer ownership of a unit. The owner is the titled property
   * owner — distinct from who occupies the unit. By default this ends any
   * existing active ownership (a sale/transfer) and opens a new one, preserving
   * the full ownership history on the unit.
   */
  async setOwner(
    unitId: string,
    orgId: string,
    data: {
      personId: string;
      startDate?: string;
      acquisitionMethod?: string;
      purchasePrice?: number;
      notes?: string;
    },
  ) {
    await this.assertUnitInOrg(unitId, orgId);
    await this.assertPersonInOrg(data.personId, orgId);
    const method = data.acquisitionMethod || 'purchase';
    if (!ACQUISITION_METHODS.includes(method as any)) {
      throw new BadRequestException(`acquisitionMethod must be one of: ${ACQUISITION_METHODS.join(', ')}`);
    }
    const start = data.startDate ? new Date(data.startDate) : new Date();
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.unitOwnership.findFirst({ where: { unitId, isActive: true } });
      if (current) {
        if (current.personId === data.personId) {
          throw new ConflictException('This person is already the active owner of this unit.');
        }
        // End the outgoing owner the day before the new ownership starts is
        // overkill — we simply close it at the transfer's start date.
        await tx.unitOwnership.update({
          where: { id: current.id },
          data: { isActive: false, endDate: start },
        });
      }
      return tx.unitOwnership.create({
        data: {
          unitId,
          personId: data.personId,
          startDate: start,
          acquisitionMethod: method,
          purchasePrice: data.purchasePrice != null ? (data.purchasePrice as any) : undefined,
          notes: data.notes,
        },
      });
    });
  }

  async endOwnership(ownershipId: string, orgId: string, endDate?: string) {
    const row = await this.prisma.unitOwnership.findFirst({
      where: { id: ownershipId, unit: { estate: { organizationId: orgId } } },
    });
    if (!row) throw new NotFoundException('Ownership record not found');
    return this.prisma.unitOwnership.update({
      where: { id: ownershipId },
      data: { isActive: false, endDate: endDate ? new Date(endDate) : new Date() },
    });
  }

  // ==================== ADDITIONAL OCCUPANTS (household) ====================

  async listAdditionalOccupants(unitId: string, orgId: string) {
    await this.assertUnitInOrg(unitId, orgId);
    return this.prisma.additionalOccupant.findMany({
      where: { unitId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addAdditionalOccupant(unitId: string, orgId: string, data: any) {
    await this.assertUnitInOrg(unitId, orgId);
    const firstName = (data.firstName ?? '').toString().trim();
    if (!firstName) throw new BadRequestException('firstName is required');
    this.assertEnum('gender', data.gender, GENDERS);
    this.assertEnum('relationship', data.relationship, RELATIONSHIPS);
    this.assertEnum('ageGroup', data.ageGroup, AGE_GROUPS);
    return this.prisma.additionalOccupant.create({
      data: {
        unitId,
        firstName,
        lastName: data.lastName?.toString().trim() || null,
        gender: data.gender || null,
        relationship: data.relationship || null,
        ageGroup: data.ageGroup || null,
        photoUrl: data.photoUrl || null,
        notes: data.notes || null,
      },
    });
  }

  async updateAdditionalOccupant(id: string, orgId: string, data: any) {
    const row = await this.prisma.additionalOccupant.findFirst({
      where: { id, unit: { estate: { organizationId: orgId } } },
    });
    if (!row) throw new NotFoundException('Occupant not found');
    this.assertEnum('gender', data.gender, GENDERS);
    this.assertEnum('relationship', data.relationship, RELATIONSHIPS);
    this.assertEnum('ageGroup', data.ageGroup, AGE_GROUPS);
    return this.prisma.additionalOccupant.update({
      where: { id },
      data: {
        firstName: data.firstName?.toString().trim(),
        lastName: data.lastName === undefined ? undefined : data.lastName?.toString().trim() || null,
        gender: data.gender,
        relationship: data.relationship,
        ageGroup: data.ageGroup,
        photoUrl: data.photoUrl,
        notes: data.notes,
      },
    });
  }

  async removeAdditionalOccupant(id: string, orgId: string) {
    const row = await this.prisma.additionalOccupant.findFirst({
      where: { id, unit: { estate: { organizationId: orgId } } },
    });
    if (!row) throw new NotFoundException('Occupant not found');
    return this.prisma.additionalOccupant.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ==================== BULK IMPORT ====================

  /**
   * Bulk-create units from parsed spreadsheet rows. The admin app parses the
   * CSV/Excel client-side and posts an array of row objects. We validate and
   * create each row independently so one bad row doesn't sink the whole batch
   * — mirroring the invites bulk-import contract. Optionally links an owner by
   * matching an existing person's email.
   */
  async bulkCreate(
    estateId: string,
    orgId: string,
    rows: Array<{
      unitNumber?: string;
      block?: string;
      street?: string;
      floor?: number | string;
      type?: string;
      ownerEmail?: string;
    }>,
    createdBy = 'system',
  ) {
    await this.assertEstateInOrg(estateId, orgId);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('rows must be a non-empty array');
    }
    if (rows.length > 1000) {
      throw new BadRequestException('Cannot import more than 1000 units at once');
    }
    const results: Array<{ row: number; unitNumber?: string; ok: boolean; unitId?: string; error?: string }> = [];
    let succeeded = 0;
    // Track within-batch duplicates so two identical rows in the same file
    // surface clearly rather than the second silently colliding in the DB.
    const seen = new Set<string>();
    // Snapshot currency for default billing attachments is the same for the batch.
    const orgCurrency = await this.unitBilling.orgCurrency(orgId);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const unitNumber = (r.unitNumber ?? '').toString().trim();
      try {
        if (!unitNumber) throw new Error('unitNumber is required');
        const block = r.block === '' || r.block == null ? null : String(r.block).trim();
        const street = r.street === '' || r.street == null ? null : String(r.street).trim();
        const floor =
          r.floor === '' || r.floor == null || Number.isNaN(Number(r.floor)) ? null : Number(r.floor);
        const key = `${unitNumber}::${block ?? ''}::${floor ?? ''}`;
        if (seen.has(key)) throw new Error('duplicate row in file');
        seen.add(key);
        await this.ensureUnitIdentityFree(estateId, { unitNumber, block, floor });

        let ownerId: string | null = null;
        if (r.ownerEmail && r.ownerEmail.trim()) {
          const owner = await this.prisma.person.findFirst({
            where: { organizationId: orgId, email: { equals: r.ownerEmail.trim(), mode: 'insensitive' } },
            select: { id: true },
          });
          ownerId = owner?.id ?? null;
        }

        // One transaction per row: unit + optional owner link + default billings.
        // A bad row drops to the catch and doesn't sink the batch.
        const created = await this.prisma.$transaction(async (tx) => {
          const unit = await tx.unit.create({
            data: {
              estateId,
              unitNumber,
              block,
              street,
              floor,
              type: r.type && typeof r.type === 'string' ? r.type : undefined,
            },
          });
          if (ownerId) {
            await tx.unitOwnership.create({
              data: { unitId: unit.id, personId: ownerId, acquisitionMethod: 'initial' },
            });
          }
          await this.unitBilling.attachDefaults(tx, { orgId, unitId: unit.id, orgCurrency, createdBy });
          return unit;
        });

        results.push({ row: i + 1, unitNumber, ok: true, unitId: created.id });
        succeeded++;
      } catch (e: any) {
        results.push({ row: i + 1, unitNumber, ok: false, error: e?.message || 'failed' });
      }
    }
    return { total: rows.length, succeeded, failed: rows.length - succeeded, results };
  }

  // ==================== helpers ====================

  private assertEnum(field: string, value: unknown, allowed: readonly string[]) {
    if (value === undefined || value === null || value === '') return;
    if (typeof value !== 'string' || !allowed.includes(value)) {
      throw new BadRequestException(`${field} must be one of: ${allowed.join(', ')}`);
    }
  }

  private async assertUnitInOrg(unitId: string, orgId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, estate: { organizationId: orgId } },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');
  }

  private async assertEstateInOrg(estateId: string, orgId: string) {
    const estate = await this.prisma.estate.findFirst({
      where: { id: estateId, organizationId: orgId },
      select: { id: true },
    });
    if (!estate) throw new NotFoundException('Estate not found');
  }

  private async assertPersonInOrg(personId: string, orgId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: orgId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException('Person not found');
  }

  /**
   * Enforce within-estate uniqueness on the (unitNumber, block, floor)
   * tuple. The user's requirement is "the combination of provided fields
   * must be unique" — null counts as a distinct value, so (1, null, null)
   * and (1, "A", null) coexist fine, but two (1, null, null) collide.
   *
   * We do this in app code because PostgreSQL's default unique index treats
   * NULLs as distinct (so a Prisma `@@unique` on these three columns would
   * *not* catch (1, NULL, NULL) duplicates). Postgres 15+'s NULLS NOT
   * DISTINCT would help, but isn't worth a migration for a check this
   * cheap.
   */
  private async ensureUnitIdentityFree(
    estateId: string,
    identity: { unitNumber: string; block: string | null; floor: number | null; excludeId?: string },
  ) {
    const conflict = await this.prisma.unit.findFirst({
      where: {
        estateId,
        unitNumber: identity.unitNumber,
        block: identity.block,
        floor: identity.floor,
        ...(identity.excludeId ? { id: { not: identity.excludeId } } : {}),
      },
      select: { id: true, unitNumber: true, block: true, floor: true },
    });
    if (conflict) {
      const parts = [`unit "${identity.unitNumber}"`];
      if (identity.block != null) parts.push(`block "${identity.block}"`);
      if (identity.floor != null) parts.push(`floor ${identity.floor}`);
      throw new ConflictException(
        `This estate already has a unit with ${parts.join(', ')}. Pick a different identifier or end the existing record first.`,
      );
    }
  }
}
