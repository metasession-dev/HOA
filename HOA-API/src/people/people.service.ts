import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse } from '../common/dto';

/** Allowed values for Person.type. Mirrored in the FE dropdown. */
const PERSON_TYPES = ['owner', 'tenant', 'stakeholder'] as const;
type PersonType = (typeof PERSON_TYPES)[number];

function assertType(t: unknown): asserts t is PersonType | undefined {
  if (t === undefined || t === null) return;
  if (typeof t !== 'string' || !PERSON_TYPES.includes(t as PersonType)) {
    throw new BadRequestException(`type must be one of: ${PERSON_TYPES.join(', ')}`);
  }
}

@Injectable()
export class PeopleService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, query: PaginationDto & { type?: string }) {
    const { page = 1, limit = 20, search, type } = query as PaginationDto & { type?: string };
    const where: any = { organizationId: orgId };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (type) {
      assertType(type);
      where.type = type;
    }
    const [data, total] = await Promise.all([
      this.prisma.person.findMany({
        where,
        include: { occupancies: { where: { isActive: true }, include: { unit: { include: { estate: true } } } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastName: 'asc' },
      }),
      this.prisma.person.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async findById(id: string, orgId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id, organizationId: orgId },
      include: {
        occupancies: {
          orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
          include: {
            unit: {
              include: {
                estate: true,
                // Surface co-occupants of the same unit so the detail page
                // can answer "this person owns Unit 14A — who lives there?"
                // (e.g. an owner who rents their unit out should see the
                // current tenant's name on their card).
                occupancies: {
                  where: { isActive: true },
                  include: {
                    person: {
                      select: { id: true, firstName: true, lastName: true, type: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!person) throw new NotFoundException('Person not found');
    return person;
  }

  async create(orgId: string, data: any) {
    assertType(data?.type);
    return this.prisma.person.create({ data: { organizationId: orgId, ...data } });
  }

  async update(id: string, orgId: string, data: any) {
    assertType(data?.type);
    await this.findById(id, orgId);
    return this.prisma.person.update({ where: { id }, data });
  }

  async assignToUnit(personId: string, data: { unitId: string; role: string; startDate: string; isPrimaryContact?: boolean }) {
    // One active occupancy per (unit, role). Joint ownership / flatmates are
    // out of scope today: a unit has at most one active owner and at most
    // one active tenant. To swap occupants, the existing one must be ended
    // first — this is intentional so the admin makes a deliberate decision
    // about transition dates rather than silently shadowing the old record.
    const existing = await this.prisma.unitOccupancy.findFirst({
      where: { unitId: data.unitId, role: data.role, isActive: true },
      include: { person: { select: { firstName: true, lastName: true } } },
    });
    if (existing) {
      const who = existing.person
        ? `${existing.person.firstName} ${existing.person.lastName}`
        : 'someone';
      throw new ConflictException(
        `This unit already has an active ${data.role} (${who}). End that occupancy first, then add the new one.`,
      );
    }
    return this.prisma.unitOccupancy.create({
      data: {
        personId,
        unitId: data.unitId,
        role: data.role,
        startDate: new Date(data.startDate),
        isPrimaryContact: data.isPrimaryContact || false,
      },
    });
  }

  async removeFromUnit(occupancyId: string) {
    return this.prisma.unitOccupancy.update({
      where: { id: occupancyId },
      data: { isActive: false, endDate: new Date() },
    });
  }
}
