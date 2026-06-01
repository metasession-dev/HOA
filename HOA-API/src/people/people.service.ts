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
        // The ownership chain this person holds — distinct from occupancy. An
        // owner who rents out their unit appears here but not in occupancies.
        ownerships: {
          orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
          include: {
            unit: {
              include: {
                estate: true,
                occupancies: {
                  where: { isActive: true },
                  include: {
                    person: { select: { id: true, firstName: true, lastName: true, type: true } },
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

  /**
   * Birds-eye view of everything a person touches across the platform. Pulls
   * from every surface a person can appear on — ownership, occupancy, billing,
   * access, compliance, requests — and folds them into a single reverse-chrono
   * timeline plus summary counters. Read-only aggregation for the detail page.
   */
  async getActivity(id: string, orgId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    if (!person) throw new NotFoundException('Person not found');

    // The set of units this person is/was tied to (as owner or occupant) — the
    // anchor for unit-scoped activity like invoices and gate passes.
    const [occupancies, ownerships] = await Promise.all([
      this.prisma.unitOccupancy.findMany({
        where: { personId: id },
        include: { unit: { include: { estate: { select: { id: true, name: true } } } } },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.unitOwnership.findMany({
        where: { personId: id },
        include: { unit: { include: { estate: { select: { id: true, name: true } } } } },
        orderBy: { startDate: 'desc' },
      }),
    ]);
    const unitIds = Array.from(
      new Set([...occupancies.map((o) => o.unitId), ...ownerships.map((o) => o.unitId)]),
    );

    const [invoices, gatePasses, violations, requests] = await Promise.all([
      unitIds.length
        ? this.prisma.invoice.findMany({
            where: { organizationId: orgId, unitId: { in: unitIds } },
            select: { id: true, invoiceNumber: true, amount: true, currency: true, status: true, dueDate: true, createdAt: true, unitId: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        : Promise.resolve([]),
      unitIds.length
        ? this.prisma.gatePass.findMany({
            where: { organizationId: orgId, unitId: { in: unitIds } },
            select: { id: true, code: true, type: true, status: true, visitorName: true, validFrom: true, validUntil: true, createdAt: true, createdBy: true, unitId: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        : Promise.resolve([]),
      unitIds.length
        ? this.prisma.violation.findMany({
            where: { organizationId: orgId, unitId: { in: unitIds } },
            select: { id: true, status: true, description: true, occurredAt: true, fineAmount: true, fineCurrency: true, createdAt: true, unitId: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        : Promise.resolve([]),
      // Requests are tied to a user, not a person — match on the linked user if any.
      person.userId
        ? this.prisma.request.findMany({
            where: { organizationId: orgId, submittedByUserId: person.userId },
            select: { id: true, subject: true, status: true, priority: true, createdAt: true, unitId: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        : Promise.resolve([]),
    ]);

    // Resident self-service profile/household changes (audit trail).
    const profileAudits = person.userId
      ? await this.prisma.auditLog.findMany({
          where: {
            organizationId: orgId,
            actorId: person.userId,
            action: { in: ['resident_profile_updated', 'resident_household_added', 'resident_household_updated', 'resident_household_removed'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      : [];

    // Build a unified timeline of typed events.
    type Event = { type: string; at: Date; title: string; meta?: any; entityId?: string };
    const events: Event[] = [];
    for (const o of ownerships) {
      const u = `${o.unit?.unitNumber ?? ''}${o.unit?.block ? ` (${o.unit.block})` : ''}`.trim();
      events.push({ type: 'ownership_start', at: o.startDate, title: `Became owner of unit ${u}`, meta: { acquisitionMethod: o.acquisitionMethod, estate: o.unit?.estate?.name }, entityId: o.id });
      if (o.endDate) events.push({ type: 'ownership_end', at: o.endDate, title: `Ownership of unit ${u} ended`, entityId: o.id });
    }
    for (const o of occupancies) {
      const u = `${o.unit?.unitNumber ?? ''}${o.unit?.block ? ` (${o.unit.block})` : ''}`.trim();
      events.push({ type: 'occupancy_start', at: o.startDate, title: `Moved into unit ${u} as ${o.role === 'owner' ? 'owner-occupier' : 'tenant'}`, meta: { role: o.role, estate: o.unit?.estate?.name }, entityId: o.id });
      if (o.endDate) events.push({ type: 'occupancy_end', at: o.endDate, title: `Moved out of unit ${u}`, entityId: o.id });
    }
    for (const inv of invoices) {
      events.push({ type: 'invoice', at: inv.createdAt, title: `Invoice ${inv.invoiceNumber} — ${inv.currency} ${inv.amount}`, meta: { status: inv.status, dueDate: inv.dueDate }, entityId: inv.id });
    }
    for (const gp of gatePasses) {
      events.push({ type: 'gate_pass', at: gp.createdAt, title: `Gate pass for ${gp.visitorName} (${gp.type})`, meta: { status: gp.status, code: gp.code }, entityId: gp.id });
    }
    for (const v of violations) {
      events.push({ type: 'violation', at: v.createdAt, title: `Violation: ${v.description?.slice(0, 80) ?? ''}`, meta: { status: v.status }, entityId: v.id });
    }
    for (const r of requests) {
      events.push({ type: 'request', at: r.createdAt, title: `Request: ${r.subject}`, meta: { status: r.status, priority: r.priority }, entityId: r.id });
    }
    const auditTitles: Record<string, string> = {
      resident_profile_updated: 'Updated their profile',
      resident_household_added: 'Added a household member',
      resident_household_updated: 'Updated a household member',
      resident_household_removed: 'Removed a household member',
    };
    for (const a of profileAudits) {
      events.push({ type: a.action, at: a.createdAt, title: auditTitles[a.action] ?? a.action, meta: a.changes, entityId: a.id });
    }
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      summary: {
        unitsOwned: ownerships.filter((o) => o.isActive).length,
        unitsOccupied: occupancies.filter((o) => o.isActive).length,
        invoices: invoices.length,
        gatePasses: gatePasses.length,
        violations: violations.length,
        requests: requests.length,
      },
      ownerships,
      occupancies,
      invoices,
      gatePasses,
      violations,
      requests,
      timeline: events.slice(0, 200),
    };
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

  async assignToUnit(personId: string, data: { unitId: string; role: string; startDate: string; isPrimaryContact?: boolean; householdSize?: number }) {
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
        householdSize: data.householdSize ?? null,
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
