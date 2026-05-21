import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BOOKKEEPING_TIERS, BookkeepingTierId, getTier, listTiers } from './tiers';

/**
 * Bookkeeping engagement lifecycle.
 *
 *   requested → active           (platform activates after vetting)
 *   active   ↔ paused
 *   active|paused → cancelled
 *
 * Invariants enforced server-side:
 *   - One non-cancelled engagement per org. Re-requesting while a row exists
 *     and is not cancelled returns 409.
 *   - Cancellation requires a reason (for audit + chargeback claims).
 *   - Accountant assignment requires the user to hold the external_accountant
 *     role in the org. This stops admins from accidentally assigning a
 *     resident.
 *   - Every state transition writes a BookkeepingEngagementEvent inside the
 *     same transaction so the audit trail can never disagree with the row.
 */

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  requested: ['active', 'cancelled'],
  active: ['paused', 'cancelled'],
  paused: ['active', 'cancelled'],
  cancelled: [], // terminal
};

@Injectable()
export class BookkeepingService {
  constructor(private prisma: PrismaService) {}

  // ---------- tiers ----------
  listTiers() {
    return listTiers();
  }

  // ---------- engagement read ----------
  async getForOrg(organizationId: string) {
    return this.prisma.bookkeepingEngagement.findUnique({
      where: { organizationId },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
  }

  async getById(id: string, organizationId: string) {
    const row = await this.prisma.bookkeepingEngagement.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 100 } },
    });
    if (!row) throw new NotFoundException('Engagement not found');
    if (row.organizationId !== organizationId) throw new ForbiddenException();
    return row;
  }

  // ---------- request ----------
  async request(opts: { organizationId: string; tier: BookkeepingTierId; notes?: string; requestedBy: string }) {
    const tier = getTier(opts.tier);
    if (!tier) throw new BadRequestException('Unknown tier');

    const existing = await this.prisma.bookkeepingEngagement.findUnique({
      where: { organizationId: opts.organizationId },
    });
    if (existing && existing.status !== 'cancelled') {
      throw new ConflictException(`Engagement already ${existing.status}; cancel it before requesting a new one.`);
    }

    const payload = {
      organizationId: opts.organizationId,
      tier: tier.id,
      status: 'requested',
      monthlyFee: tier.monthlyFeeZAR,
      currency: 'ZAR',
      notes: opts.notes ?? null,
      requestedBy: opts.requestedBy,
    };

    return this.prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.bookkeepingEngagement.update({
            // A cancelled engagement is overwritten — preserves the unique index
            // while still letting an org come back later. The events log keeps
            // history of the prior tenure.
            where: { organizationId: opts.organizationId },
            data: {
              tier: tier.id,
              status: 'requested',
              monthlyFee: tier.monthlyFeeZAR,
              currency: 'ZAR',
              notes: opts.notes ?? null,
              requestedBy: opts.requestedBy,
              startedAt: null,
              endedAt: null,
              pausedAt: null,
              cancelledAt: null,
              cancellationReason: null,
              accountantUserId: null,
            },
          })
        : await tx.bookkeepingEngagement.create({ data: payload });

      await tx.bookkeepingEngagementEvent.create({
        data: {
          engagementId: row.id,
          type: 'requested',
          actorId: opts.requestedBy,
          payload: { tier: tier.id, monthlyFeeZAR: tier.monthlyFeeZAR, notes: opts.notes },
        },
      });
      return row;
    });
  }

  // ---------- activate ----------
  async activate(opts: { id: string; organizationId: string; actorId: string; accountantUserId?: string }) {
    const row = await this.getById(opts.id, opts.organizationId);
    this.assertTransition(row.status, 'active');

    return this.prisma.$transaction(async (tx) => {
      let accountantUserId = row.accountantUserId;
      if (opts.accountantUserId) {
        await this.assertAccountant(tx, opts.accountantUserId, opts.organizationId);
        accountantUserId = opts.accountantUserId;
      }
      const updated = await tx.bookkeepingEngagement.update({
        where: { id: row.id },
        data: { status: 'active', startedAt: row.startedAt ?? new Date(), accountantUserId, pausedAt: null },
      });
      await tx.bookkeepingEngagementEvent.create({
        data: { engagementId: row.id, type: 'activated', actorId: opts.actorId, payload: { accountantUserId } },
      });
      return updated;
    });
  }

  // ---------- accountant assignment (post-activation re-assign) ----------
  async assignAccountant(opts: { id: string; organizationId: string; actorId: string; accountantUserId: string }) {
    const row = await this.getById(opts.id, opts.organizationId);
    if (row.status === 'cancelled') throw new BadRequestException('Engagement is cancelled');
    return this.prisma.$transaction(async (tx) => {
      await this.assertAccountant(tx, opts.accountantUserId, opts.organizationId);
      const updated = await tx.bookkeepingEngagement.update({
        where: { id: row.id },
        data: { accountantUserId: opts.accountantUserId },
      });
      await tx.bookkeepingEngagementEvent.create({
        data: {
          engagementId: row.id,
          type: 'accountant_assigned',
          actorId: opts.actorId,
          payload: { accountantUserId: opts.accountantUserId, previousAccountantUserId: row.accountantUserId },
        },
      });
      return updated;
    });
  }

  // ---------- tier change ----------
  async changeTier(opts: { id: string; organizationId: string; actorId: string; tier: BookkeepingTierId }) {
    const row = await this.getById(opts.id, opts.organizationId);
    if (row.status === 'cancelled') throw new BadRequestException('Engagement is cancelled');
    const tier = getTier(opts.tier);
    if (!tier) throw new BadRequestException('Unknown tier');
    if (row.tier === tier.id) return row;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookkeepingEngagement.update({
        where: { id: row.id },
        data: { tier: tier.id, monthlyFee: tier.monthlyFeeZAR },
      });
      await tx.bookkeepingEngagementEvent.create({
        data: {
          engagementId: row.id,
          type: 'tier_changed',
          actorId: opts.actorId,
          payload: { from: row.tier, to: tier.id, monthlyFeeZAR: tier.monthlyFeeZAR },
        },
      });
      return updated;
    });
  }

  // ---------- pause / resume ----------
  async pause(opts: { id: string; organizationId: string; actorId: string }) {
    const row = await this.getById(opts.id, opts.organizationId);
    this.assertTransition(row.status, 'paused');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookkeepingEngagement.update({
        where: { id: row.id },
        data: { status: 'paused', pausedAt: new Date() },
      });
      await tx.bookkeepingEngagementEvent.create({
        data: { engagementId: row.id, type: 'paused', actorId: opts.actorId, payload: {} },
      });
      return updated;
    });
  }

  async resume(opts: { id: string; organizationId: string; actorId: string }) {
    const row = await this.getById(opts.id, opts.organizationId);
    this.assertTransition(row.status, 'active');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookkeepingEngagement.update({
        where: { id: row.id },
        data: { status: 'active', pausedAt: null },
      });
      await tx.bookkeepingEngagementEvent.create({
        data: { engagementId: row.id, type: 'resumed', actorId: opts.actorId, payload: {} },
      });
      return updated;
    });
  }

  // ---------- cancel ----------
  async cancel(opts: { id: string; organizationId: string; actorId: string; reason: string }) {
    const row = await this.getById(opts.id, opts.organizationId);
    this.assertTransition(row.status, 'cancelled');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookkeepingEngagement.update({
        where: { id: row.id },
        data: { status: 'cancelled', cancelledAt: new Date(), endedAt: new Date(), cancellationReason: opts.reason },
      });
      await tx.bookkeepingEngagementEvent.create({
        data: { engagementId: row.id, type: 'cancelled', actorId: opts.actorId, payload: { reason: opts.reason } },
      });
      return updated;
    });
  }

  // ---------- notes ----------
  async addNote(opts: { id: string; organizationId: string; actorId: string; note: string }) {
    const row = await this.getById(opts.id, opts.organizationId);
    return this.prisma.bookkeepingEngagementEvent.create({
      data: { engagementId: row.id, type: 'note_added', actorId: opts.actorId, payload: { note: opts.note } },
    });
  }

  // ---------- helpers ----------
  private assertTransition(from: string, to: string) {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new ConflictException(`Cannot transition engagement from "${from}" to "${to}".`);
    }
  }

  // Confirm a user holds the external_accountant role *in this org*.
  // We accept a transaction so callers can wrap the check + the mutation.
  private async assertAccountant(tx: any, userId: string, organizationId: string) {
    const role = await tx.userRole.findFirst({
      where: {
        userId,
        organizationId,
        role: { name: 'external_accountant' },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException(
        'Assigned user must hold the external_accountant role in this organization. Invite them first.',
      );
    }
  }
}

// Re-export the tier list type so controllers can keep their imports tight.
export type { BookkeepingTierId };
export { BOOKKEEPING_TIERS };
