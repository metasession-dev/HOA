import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse } from '../common/dto';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async findByEstate(estateId: string, query: PaginationDto) {
    const { page = 1, limit = 50, search } = query;
    const where: any = { estateId };
    if (search) {
      where.OR = [
        { unitNumber: { contains: search, mode: 'insensitive' } },
        { block: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        include: {
          occupancies: { where: { isActive: true }, include: { person: true } },
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
    const unit = await this.prisma.unit.findFirst({
      where: {
        id,
        ...(orgId ? { estate: { organizationId: orgId } } : {}),
      },
      include: {
        estate: true,
        occupancies: {
          orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
          include: {
            person: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, type: true },
            },
          },
        },
        invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  async create(estateId: string, data: any) {
    const unitNumber = (data.unitNumber ?? '').toString().trim();
    if (!unitNumber) {
      throw new BadRequestException('unitNumber is required');
    }
    // Normalise block + floor — empty strings get coerced to null so the
    // uniqueness comparison below treats "no block" consistently across
    // submissions (whether the client sends "", undefined, or null).
    const block = data.block === '' || data.block == null ? null : String(data.block).trim();
    const floor =
      data.floor === '' || data.floor == null || Number.isNaN(Number(data.floor))
        ? null
        : Number(data.floor);

    await this.ensureUnitIdentityFree(estateId, { unitNumber, block, floor });

    return this.prisma.unit.create({
      data: { estateId, ...data, unitNumber, block, floor },
    });
  }

  async update(id: string, data: any) {
    // If the update touches any identity field, re-check uniqueness against
    // the rest of the estate (excluding the row being updated).
    const touchesIdentity =
      data.unitNumber !== undefined || data.block !== undefined || data.floor !== undefined;
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
