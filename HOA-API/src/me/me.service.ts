import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Phase 10.3 — resident self-service endpoints.
 *
 * Owners + tenants drive most reads/writes themselves: profile edit,
 * notification preferences per topic+channel, occupant management on the
 * units they're tied to. Scope guards live here so the controller stays thin.
 */

const ALLOWED_TOPICS = [
  'invoices',
  'payments',
  'requests',
  'violations',
  'votes',
  'broadcasts',
  'security',
  'system',
] as const;
export type NotificationTopic = (typeof ALLOWED_TOPICS)[number];

const CHANNELS = ['email', 'sms', 'push', 'whatsapp'] as const;
export type Channel = (typeof CHANNELS)[number];

@Injectable()
export class MeService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Notify the management team (admins + property managers) that a resident
   * changed something on their account. Best-effort; never blocks the write and
   * skips the actor themselves. `summary` is a short human sentence.
   */
  private notifyManagersOfChange(
    organizationId: string,
    actorUserId: string,
    actorName: string,
    type: string,
    summary: string,
  ) {
    this.notifications
      .notifyByRole({
        organizationId,
        roleNames: ['hoa_admin', 'super_admin', 'property_manager'],
        type,
        title: summary,
        body: summary,
        entityType: 'User',
        entityId: actorUserId,
        excludeUserId: actorUserId,
        alsoEmail: { subject: summary, message: `${summary} You can review the change in the People area.` },
      })
      .catch(() => { /* swallow */ });
  }

  /**
   * Record a resident self-service change to the audit trail so both the
   * resident (GET /me/activity-log) and admins (People activity) keep a history.
   * Best-effort — never blocks the underlying write.
   */
  private logChange(
    organizationId: string | undefined | null,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes: any,
  ) {
    return this.prisma.auditLog
      .create({ data: { organizationId: organizationId || null, actorId, actorRole: 'resident', action, entityType, entityId, changes: changes as any } })
      .catch(() => { /* never block the write on audit */ });
  }

  private async actorDisplayName(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    return [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || u?.email || 'A resident';
  }

  // ----- profile -----
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true,
        avatarUrl: true, language: true, emailVerified: true, createdAt: true,
        userRoles: {
          select: {
            role: { select: { name: true, displayName: true } },
            organizationId: true,
            organization: { select: { name: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(
    userId: string,
    organizationId: string,
    data: { firstName?: string; lastName?: string; phone?: string | null; avatarUrl?: string | null; language?: string },
  ) {
    const trimmed = {
      firstName: data.firstName?.trim(),
      lastName: data.lastName?.trim(),
      phone: data.phone === undefined ? undefined : data.phone?.trim() || null,
      avatarUrl: data.avatarUrl === undefined ? undefined : data.avatarUrl || null,
      language: data.language === undefined ? undefined : data.language,
    };
    if (trimmed.firstName !== undefined && trimmed.firstName.length === 0) {
      throw new BadRequestException('firstName cannot be empty');
    }
    if (trimmed.lastName !== undefined && trimmed.lastName.length === 0) {
      throw new BadRequestException('lastName cannot be empty');
    }
    // Best-effort phone format check — strip non-digits before length test so
    // a value like "+27 82 123 4567" still passes.
    if (trimmed.phone && trimmed.phone.replace(/\D/g, '').length < 6) {
      throw new BadRequestException('phone is too short');
    }
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, phone: true, avatarUrl: true, language: true },
    });
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: trimmed,
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatarUrl: true, language: true },
    });
    // Keep the linked Person row in sync — the resident PWA + admin both read
    // contact details from Person, not User, in invoice / pass / request flows.
    await this.prisma.person.updateMany({
      where: { userId },
      data: {
        firstName: trimmed.firstName,
        lastName: trimmed.lastName,
        phone: trimmed.phone,
        // Keep the linked Person's photo in sync so the resident's uploaded
        // avatar also shows in the admin People views.
        photoUrl: trimmed.avatarUrl,
      },
    });
    // Record exactly which fields changed for the history (both apps read this).
    const FIELDS = ['firstName', 'lastName', 'phone', 'avatarUrl', 'language'] as const;
    const changed: Record<string, { from: any; to: any }> = {};
    for (const k of FIELDS) {
      if ((trimmed as any)[k] !== undefined && before && (before as any)[k] !== (user as any)[k]) {
        changed[k] = { from: (before as any)[k] ?? null, to: (user as any)[k] ?? null };
      }
    }
    if (Object.keys(changed).length > 0) {
      this.logChange(organizationId, userId, 'resident_profile_updated', 'User', userId, { changed });
      if (organizationId) {
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
        this.notifyManagersOfChange(
          organizationId,
          userId,
          name,
          'resident_profile_updated',
          `${name} updated their profile details.`,
        );
      }
    }
    return user;
  }

  /**
   * Change the signed-in user's password. Requires the current password
   * (defence-in-depth: even if a session is hijacked the attacker can't
   * change the credential without knowing the existing one). Bumps
   * `sessionVersion` so every OTHER live JWT for this user is invalidated
   * — the user can keep using their current session (re-issued in the
   * caller flow if needed) but anyone else holding a stolen token loses
   * access.
   */
  async changePassword(
    userId: string,
    data: { currentPassword: string; newPassword: string },
  ) {
    if (
      typeof data.newPassword !== 'string' ||
      data.newPassword.length < 8 ||
      data.newPassword.length > 200
    ) {
      throw new BadRequestException('newPassword must be 8–200 characters');
    }
    if (data.currentPassword === data.newPassword) {
      throw new BadRequestException("New password can't be the same as the current one");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, isActive: true },
    });
    if (!user || !user.isActive) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!ok) {
      // Constant message — don't tell the attacker which part was wrong.
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
    return { ok: true };
  }

  // ----- notification preferences -----
  async listPreferences(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { topic: 'asc' },
    });
    // Backfill missing topics so the UI always renders the full grid.
    const byTopic = new Map(rows.map((r) => [r.topic, r]));
    return ALLOWED_TOPICS.map((topic) => {
      const found = byTopic.get(topic);
      return found ?? { topic, email: true, sms: false, push: true, whatsapp: false };
    });
  }

  async setPreference(
    userId: string,
    topic: string,
    channels: Partial<Record<Channel, boolean>>,
  ) {
    if (!ALLOWED_TOPICS.includes(topic as NotificationTopic)) {
      throw new BadRequestException(`Unknown topic. Allowed: ${ALLOWED_TOPICS.join(', ')}`);
    }
    const data = {
      email: channels.email,
      sms: channels.sms,
      push: channels.push,
      whatsapp: channels.whatsapp,
    };
    return this.prisma.notificationPreference.upsert({
      where: { userId_topic: { userId, topic } },
      update: data,
      create: {
        userId,
        topic,
        email: data.email ?? true,
        sms: data.sms ?? false,
        push: data.push ?? true,
        whatsapp: data.whatsapp ?? false,
      },
    });
  }

  /**
   * Bulk replace — useful for the settings page's "save all" button.
   * Validates every row before applying any so a partial save can't desync.
   */
  async setAllPreferences(
    userId: string,
    rows: Array<{ topic: string; email?: boolean; sms?: boolean; push?: boolean; whatsapp?: boolean }>,
  ) {
    for (const r of rows) {
      if (!ALLOWED_TOPICS.includes(r.topic as NotificationTopic)) {
        throw new BadRequestException(`Unknown topic: ${r.topic}`);
      }
    }
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_topic: { userId, topic: r.topic } },
          update: { email: r.email, sms: r.sms, push: r.push, whatsapp: r.whatsapp },
          create: {
            userId,
            topic: r.topic,
            email: r.email ?? true,
            sms: r.sms ?? false,
            push: r.push ?? true,
            whatsapp: r.whatsapp ?? false,
          },
        }),
      ),
    );
    return this.listPreferences(userId);
  }

  // ----- occupants -----
  /** Units this user is the primary contact / owner of. Scopes occupant CRUD. */
  private async myUnitsAsOwner(userId: string, organizationId: string): Promise<string[]> {
    const me = await this.prisma.person.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    });
    if (!me) return [];
    const occ = await this.prisma.unitOccupancy.findMany({
      where: { personId: me.id, isActive: true, role: 'owner' },
      select: { unitId: true },
    });
    return occ.map((o) => o.unitId);
  }

  /**
   * Every unit the current user is actively occupying — either as owner or
   * tenant. Used by the resident PWA for forms that should auto-fill the
   * unit (new request, gate pass, etc.) instead of asking the resident to
   * pick from a list of estates they don't even have access to.
   *
   * Returns one entry per active occupancy with role + estate + unit info
   * so the FE can render "House 9 · Urban Prime 2 · tenant" in a chip.
   */
  async myUnits(userId: string, organizationId: string) {
    const persons = await this.prisma.person.findMany({
      where: { userId, organizationId },
      select: { id: true },
    });
    if (persons.length === 0) return [];
    const occs = await this.prisma.unitOccupancy.findMany({
      where: {
        personId: { in: persons.map((p) => p.id) },
        isActive: true,
      },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            block: true,
            floor: true,
            type: true,
            estate: { select: { id: true, name: true, address: true } },
          },
        },
      },
      orderBy: [{ startDate: 'desc' }],
    });
    return occs.map((o) => ({
      occupancyId: o.id,
      role: o.role,
      isPrimaryContact: o.isPrimaryContact,
      startDate: o.startDate,
      unit: o.unit,
    }));
  }

  async listOccupants(userId: string, organizationId: string) {
    const unitIds = await this.myUnitsAsOwner(userId, organizationId);
    if (unitIds.length === 0) return [];
    return this.prisma.unitOccupancy.findMany({
      where: { unitId: { in: unitIds }, isActive: true },
      include: {
        unit: { select: { id: true, unitNumber: true, block: true } },
        person: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, userId: true },
        },
      },
      orderBy: [{ unitId: 'asc' }, { role: 'asc' }],
    });
  }

  async addOccupant(
    userId: string,
    organizationId: string,
    input: {
      unitId: string;
      role: 'tenant' | 'dependent' | 'caretaker';
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      startDate?: string;
    },
  ) {
    const allowedRoles = ['tenant', 'dependent', 'caretaker'];
    if (!allowedRoles.includes(input.role)) {
      throw new BadRequestException(`role must be one of: ${allowedRoles.join(', ')}`);
    }
    const myUnits = await this.myUnitsAsOwner(userId, organizationId);
    if (!myUnits.includes(input.unitId)) {
      throw new ForbiddenException('You can only add occupants to a unit you own.');
    }
    // Create the Person row; relate to the unit via a fresh occupancy.
    return this.prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          organizationId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
        },
      });
      const occ = await tx.unitOccupancy.create({
        data: {
          unitId: input.unitId,
          personId: person.id,
          // Schema's role enum is owner|tenant — for dependents/caretakers we
          // map them to 'tenant' and tag the distinction in Person.notes
          // (added in a later migration); for now downstream code already
          // tolerates `tenant`.
          role: input.role === 'dependent' || input.role === 'caretaker' ? 'tenant' : input.role,
          startDate: input.startDate ? new Date(input.startDate) : new Date(),
          isActive: true,
        },
      });
      return { person, occupancy: occ };
    });
  }

  async endOccupant(
    userId: string,
    organizationId: string,
    occupancyId: string,
    endDate?: string,
  ) {
    const myUnits = await this.myUnitsAsOwner(userId, organizationId);
    const occ = await this.prisma.unitOccupancy.findUnique({ where: { id: occupancyId } });
    if (!occ) throw new NotFoundException();
    if (!myUnits.includes(occ.unitId)) throw new ForbiddenException();
    if (occ.role === 'owner') {
      throw new BadRequestException('Cannot end an owner occupancy from this endpoint.');
    }
    return this.prisma.unitOccupancy.update({
      where: { id: occupancyId },
      data: { isActive: false, endDate: endDate ? new Date(endDate) : new Date() },
    });
  }

  /** Update a non-owner occupant's basic contact info. Scope-guarded. */
  async updateOccupant(
    userId: string,
    organizationId: string,
    occupancyId: string,
    input: { firstName?: string; lastName?: string; email?: string | null; phone?: string | null },
  ) {
    const myUnits = await this.myUnitsAsOwner(userId, organizationId);
    const occ = await this.prisma.unitOccupancy.findUnique({
      where: { id: occupancyId },
      include: { person: true },
    });
    if (!occ) throw new NotFoundException();
    if (!myUnits.includes(occ.unitId)) throw new ForbiddenException();
    if (occ.role === 'owner') throw new BadRequestException('Owner edits go through profile.');
    return this.prisma.person.update({
      where: { id: occ.personId },
      data: {
        firstName: input.firstName?.trim(),
        lastName: input.lastName?.trim(),
        email: input.email === undefined ? undefined : input.email?.trim() || null,
        phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
      },
    });
  }

  // ----- household members (AdditionalOccupant) -----
  // Lightweight family / household records (no login) the resident manages for
  // any unit they actively occupy (owner OR tenant). Scope-guarded so a
  // resident can never touch a unit they don't occupy.

  /** Units the user actively occupies (owner or tenant) — the household scope. */
  private async myOccupiedUnitIds(userId: string, organizationId: string): Promise<string[]> {
    const persons = await this.prisma.person.findMany({
      where: { userId, organizationId },
      select: { id: true },
    });
    if (persons.length === 0) return [];
    const occ = await this.prisma.unitOccupancy.findMany({
      where: { personId: { in: persons.map((p) => p.id) }, isActive: true },
      select: { unitId: true },
    });
    return Array.from(new Set(occ.map((o) => o.unitId)));
  }

  async listHousehold(userId: string, organizationId: string) {
    const unitIds = await this.myOccupiedUnitIds(userId, organizationId);
    if (unitIds.length === 0) return [];
    return this.prisma.additionalOccupant.findMany({
      where: { unitId: { in: unitIds }, isActive: true },
      include: { unit: { select: { id: true, unitNumber: true, block: true } } },
      orderBy: [{ unitId: 'asc' }, { firstName: 'asc' }],
    });
  }

  async addHousehold(
    userId: string,
    organizationId: string,
    input: {
      unitId: string;
      firstName: string;
      lastName?: string;
      relationship?: string;
      gender?: string;
      ageGroup?: string;
      email?: string;
      phone?: string;
      photoUrl?: string;
      notes?: string;
    },
  ) {
    const unitIds = await this.myOccupiedUnitIds(userId, organizationId);
    if (!unitIds.includes(input.unitId)) {
      throw new ForbiddenException('You can only add household members to a unit you occupy.');
    }
    if (!input.firstName?.trim()) throw new BadRequestException('firstName is required');
    const created = await this.prisma.additionalOccupant.create({
      data: {
        unitId: input.unitId,
        firstName: input.firstName.trim(),
        lastName: input.lastName?.trim() || null,
        relationship: input.relationship?.trim() || null,
        gender: input.gender?.trim() || null,
        ageGroup: input.ageGroup?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        photoUrl: input.photoUrl?.trim() || null,
        notes: input.notes?.trim() || null,
        isActive: true,
      },
    });
    const name = await this.actorDisplayName(userId);
    const memberName = [created.firstName, created.lastName].filter(Boolean).join(' ').trim();
    this.logChange(organizationId, userId, 'resident_household_added', 'AdditionalOccupant', created.id, {
      member: memberName, relationship: created.relationship,
    });
    this.notifyManagersOfChange(
      organizationId,
      userId,
      name,
      'resident_household_updated',
      `${name} added a household member${memberName ? ` (${memberName})` : ''}.`,
    );
    return created;
  }

  /** Load + scope-check a household record belongs to a unit the user occupies. */
  private async scopedHousehold(userId: string, organizationId: string, id: string) {
    const ho = await this.prisma.additionalOccupant.findUnique({ where: { id } });
    if (!ho) throw new NotFoundException('Household member not found');
    const unitIds = await this.myOccupiedUnitIds(userId, organizationId);
    if (!unitIds.includes(ho.unitId)) throw new ForbiddenException('Not your unit');
    return ho;
  }

  async updateHousehold(
    userId: string,
    organizationId: string,
    id: string,
    input: {
      firstName?: string;
      lastName?: string | null;
      relationship?: string | null;
      gender?: string | null;
      ageGroup?: string | null;
      email?: string | null;
      phone?: string | null;
      photoUrl?: string | null;
      notes?: string | null;
    },
  ) {
    await this.scopedHousehold(userId, organizationId, id);
    const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
    const updated = await this.prisma.additionalOccupant.update({
      where: { id },
      data: {
        firstName: input.firstName?.trim() || undefined,
        lastName: clean(input.lastName),
        relationship: clean(input.relationship),
        gender: clean(input.gender),
        ageGroup: clean(input.ageGroup),
        email: clean(input.email),
        phone: clean(input.phone),
        photoUrl: clean(input.photoUrl),
        notes: clean(input.notes),
      },
    });
    const name = await this.actorDisplayName(userId);
    const memberName = [updated.firstName, updated.lastName].filter(Boolean).join(' ').trim();
    this.logChange(organizationId, userId, 'resident_household_updated', 'AdditionalOccupant', updated.id, {
      member: memberName, relationship: updated.relationship,
    });
    this.notifyManagersOfChange(
      organizationId,
      userId,
      name,
      'resident_household_updated',
      `${name} updated a household member${memberName ? ` (${memberName})` : ''}.`,
    );
    return updated;
  }

  async removeHousehold(userId: string, organizationId: string, id: string) {
    await this.scopedHousehold(userId, organizationId, id);
    const removed = await this.prisma.additionalOccupant.update({
      where: { id },
      data: { isActive: false },
    });
    const name = await this.actorDisplayName(userId);
    const memberName = [removed.firstName, removed.lastName].filter(Boolean).join(' ').trim();
    this.logChange(organizationId, userId, 'resident_household_removed', 'AdditionalOccupant', removed.id, {
      member: memberName, relationship: removed.relationship,
    });
    this.notifyManagersOfChange(
      organizationId,
      userId,
      name,
      'resident_household_updated',
      `${name} removed a household member${memberName ? ` (${memberName})` : ''}.`,
    );
    return removed;
  }

  /** Resident's own change history (profile + household), newest first. */
  async activityLog(userId: string, limit = 50) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        actorId: userId,
        action: { in: ['resident_profile_updated', 'resident_household_added', 'resident_household_updated', 'resident_household_removed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: { id: true, action: true, entityType: true, entityId: true, changes: true, createdAt: true },
    });
    return rows;
  }
}
