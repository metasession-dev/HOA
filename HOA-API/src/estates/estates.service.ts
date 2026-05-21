import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse } from '../common/dto';

@Injectable()
export class EstatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, query: PaginationDto) {
    const { page = 1, limit = 20, search } = query;
    const where: any = { organizationId: orgId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.estate.findMany({
        where,
        include: { _count: { select: { units: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.estate.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async findById(id: string, orgId: string) {
    const estate = await this.prisma.estate.findFirst({
      where: { id, organizationId: orgId },
      include: {
        units: {
          orderBy: [{ block: 'asc' }, { unitNumber: 'asc' }],
          include: {
            // Hydrate the FULL occupancy graph so the admin estate-detail
            // page can render owner / tenant badges, status (vacant /
            // rented / owner-occupied) and the manage-occupants drawer
            // (active + history). Previously we only sent _count which
            // made every unit render as "Vacant" in the UI.
            //
            // Ordering: active first (so the drawer's "Active" section
            // shows the most-recent), then most-recent ended last so the
            // history list is reverse-chronological.
            occupancies: {
              orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
              include: {
                person: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                    type: true,
                  },
                },
              },
            },
            _count: { select: { occupancies: true } },
          },
        },
      },
    });
    if (!estate) throw new NotFoundException('Estate not found');
    return estate;
  }

  async create(orgId: string, data: { name: string; address?: string; totalUnits?: number }) {
    return this.prisma.estate.create({
      data: { organizationId: orgId, ...data },
    });
  }

  async update(id: string, orgId: string, data: { name?: string; address?: string; totalUnits?: number }) {
    await this.findById(id, orgId);
    return this.prisma.estate.update({ where: { id }, data });
  }

  async delete(id: string, orgId: string) {
    await this.findById(id, orgId);
    return this.prisma.estate.delete({ where: { id } });
  }
}
