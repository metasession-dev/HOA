import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Actor, isResidentRole } from '../common/scope.util';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateVoteDto, CastBallotDto, GrantProxyDto } from './dto/votes.dto';
import {
  computeAnonymousHash,
  countEligiblePersons,
  findPersonForUser,
  isPersonEligible,
} from './eligibility.util';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['open', 'cancelled'],
  open: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

const RESIDENT_BASE = process.env.APP_RESIDENTS_URL || process.env.RESIDENT_BASE_URL || process.env.RESIDENTS_BASE_URL || 'http://localhost:3002';

@Injectable()
export class VotesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * User ids eligible to be notified about a vote. Owners-only rules notify
   * active owners (via the title chain); resident-wide rules notify all active
   * occupants. (Final eligibility is still enforced at ballot-cast time.)
   */
  private async voterUserIds(orgId: string, eligibilityRule: string): Promise<string[]> {
    if (eligibilityRule === 'all_residents') {
      const occ = await this.prisma.unitOccupancy.findMany({
        where: { isActive: true, unit: { estate: { organizationId: orgId } }, person: { userId: { not: null } } },
        select: { person: { select: { userId: true } } },
      });
      return Array.from(new Set(occ.map((o) => o.person?.userId).filter((x): x is string => !!x)));
    }
    // all_owners | paid_up_only | tag_match → active titled owners.
    const own = await this.prisma.unitOwnership.findMany({
      where: { isActive: true, unit: { estate: { organizationId: orgId } }, person: { userId: { not: null } } },
      select: { person: { select: { userId: true } } },
    });
    return Array.from(new Set(own.map((o) => o.person?.userId).filter((x): x is string => !!x)));
  }

  // ---------- Listing & detail ----------

  async list(orgId: string, actor: Actor, query: { status?: string; type?: string }) {
    const baseWhere: any = { organizationId: orgId };
    if (query.status) baseWhere.status = query.status;
    if (query.type) baseWhere.type = query.type;

    // Residents only see votes that are open/closed (no drafts)
    if (isResidentRole(actor.role)) {
      baseWhere.status = baseWhere.status ?? { in: ['open', 'closed'] };
    }

    const votes = await this.prisma.vote.findMany({
      where: baseWhere,
      orderBy: [{ status: 'asc' }, { opensAt: 'desc' }],
      include: {
        _count: { select: { ballots: true } },
      },
    });
    return { success: true, data: votes };
  }

  async findById(id: string, orgId: string, actor: Actor) {
    const v = await this.prisma.vote.findFirst({
      where: { id, organizationId: orgId },
      include: { _count: { select: { ballots: true, proxies: true } } },
    });
    if (!v) throw new NotFoundException('Vote not found');
    if (isResidentRole(actor.role) && v.status === 'draft') {
      throw new NotFoundException('Vote not found');
    }

    // Whether the actor has already cast (for resident UI hint)
    let hasCast = false;
    let isEligible: { eligible: boolean; reason?: string } | null = null;
    if (isResidentRole(actor.role)) {
      const person = await findPersonForUser(this.prisma, actor.userId, orgId);
      if (person) {
        if (v.anonymous) {
          const hash = computeAnonymousHash(v.id, person.id);
          const existing = await this.prisma.ballot.findFirst({ where: { voteId: v.id, anonymousHash: hash } });
          hasCast = !!existing;
        } else {
          const existing = await this.prisma.ballot.findFirst({
            where: { voteId: v.id, voterPersonId: person.id },
          });
          hasCast = !!existing;
        }
        isEligible = await isPersonEligible(this.prisma, v, person.id);
      } else {
        isEligible = { eligible: false, reason: 'no_person_record' };
      }
    }

    return { ...v, hasCast, isEligible };
  }

  // ---------- Mutations ----------

  async create(orgId: string, actor: Actor, dto: CreateVoteDto) {
    // Validate type-specific constraints
    const type = dto.type || 'standard';
    const passThreshold = dto.passThresholdPercent ?? (type === 'special_resolution' ? 75 : 50);
    const noticePeriod = dto.noticePeriodDays ?? (type === 'special_resolution' ? 14 : 0);

    if (type === 'special_resolution') {
      if (passThreshold < 75) {
        throw new BadRequestException('Special resolution requires passThresholdPercent ≥ 75');
      }
      if (noticePeriod < 14) {
        throw new BadRequestException('Special resolution requires noticePeriodDays ≥ 14');
      }
    }

    const opensAt = new Date(dto.opensAt);
    const closesAt = new Date(dto.closesAt);
    if (closesAt <= opensAt) {
      throw new BadRequestException('closesAt must be after opensAt');
    }
    // Validate unique option IDs
    const optionIds = new Set(dto.options.map((o) => o.id));
    if (optionIds.size !== dto.options.length) {
      throw new BadRequestException('Vote option ids must be unique');
    }

    return this.prisma.$transaction(async (tx) => {
      const vote = await tx.vote.create({
        data: {
          organizationId: orgId,
          title: dto.title,
          description: dto.description,
          type,
          createdBy: actor.userId,
          options: dto.options as any,
          allowMultiple: dto.allowMultiple ?? false,
          anonymous: dto.anonymous ?? false,
          eligibilityRule: dto.eligibilityRule || 'all_owners',
          eligibilityFilter: dto.eligibilityFilter as any,
          quorumPercent: dto.quorumPercent ?? 50,
          passThresholdPercent: passThreshold,
          proxyAllowed: dto.proxyAllowed ?? true,
          resultsLiveVisible: dto.resultsLiveVisible ?? false,
          opensAt,
          closesAt,
          noticePeriodDays: noticePeriod,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'create',
          entityType: 'Vote',
          entityId: vote.id,
          changes: { after: { type, title: dto.title } } as any,
        },
      });
      return vote;
    });
  }

  async update(id: string, orgId: string, actor: Actor, dto: Partial<CreateVoteDto>) {
    const v = await this.prisma.vote.findFirst({ where: { id, organizationId: orgId } });
    if (!v) throw new NotFoundException('Vote not found');
    if (v.status !== 'draft') {
      throw new ConflictException('Can only edit votes while draft');
    }
    if (v.createdBy !== actor.userId && actor.role !== 'hoa_admin' && actor.role !== 'super_admin') {
      throw new ForbiddenException('Only the creator or an admin can edit a draft');
    }

    const data: any = {};
    if (dto.title) data.title = dto.title;
    if (dto.description) data.description = dto.description;
    if (dto.options) data.options = dto.options as any;
    if (dto.allowMultiple !== undefined) data.allowMultiple = dto.allowMultiple;
    if (dto.anonymous !== undefined) data.anonymous = dto.anonymous;
    if (dto.eligibilityRule) data.eligibilityRule = dto.eligibilityRule;
    if (dto.eligibilityFilter !== undefined) data.eligibilityFilter = dto.eligibilityFilter as any;
    if (dto.quorumPercent !== undefined) data.quorumPercent = dto.quorumPercent;
    if (dto.passThresholdPercent !== undefined) data.passThresholdPercent = dto.passThresholdPercent;
    if (dto.proxyAllowed !== undefined) data.proxyAllowed = dto.proxyAllowed;
    if (dto.resultsLiveVisible !== undefined) data.resultsLiveVisible = dto.resultsLiveVisible;
    if (dto.opensAt) data.opensAt = new Date(dto.opensAt);
    if (dto.closesAt) data.closesAt = new Date(dto.closesAt);
    if (dto.noticePeriodDays !== undefined) data.noticePeriodDays = dto.noticePeriodDays;

    return this.prisma.vote.update({ where: { id }, data });
  }

  async second(id: string, orgId: string, actor: Actor) {
    const v = await this.prisma.vote.findFirst({ where: { id, organizationId: orgId } });
    if (!v) throw new NotFoundException('Vote not found');
    if (v.status !== 'draft') throw new ConflictException('Can only second a draft motion');
    if (v.createdBy === actor.userId) throw new ConflictException('The motion creator cannot second their own motion');
    if (v.secondedBy) throw new ConflictException('Motion already seconded');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vote.update({ where: { id }, data: { secondedBy: actor.userId } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'seconded',
          entityType: 'Vote',
          entityId: id,
          changes: {} as any,
        },
      });
      return updated;
    });
  }

  async open(id: string, orgId: string, actor: Actor) {
    const v = await this.prisma.vote.findFirst({ where: { id, organizationId: orgId } });
    if (!v) throw new NotFoundException('Vote not found');
    if (!ALLOWED_TRANSITIONS[v.status]?.includes('open')) {
      throw new ConflictException(`Cannot open vote in status ${v.status}`);
    }
    if (v.type === 'special_resolution' && !v.secondedBy) {
      throw new ConflictException('Special resolution must be seconded before opening');
    }
    if (new Date() > v.closesAt) {
      throw new BadRequestException('closesAt is in the past');
    }

    // Snapshot eligible voter count BEFORE opening (under lock)
    const opened = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.vote.findUnique({ where: { id } });
      if (!fresh || fresh.status !== 'draft') {
        throw new ConflictException(`Vote no longer in draft (now ${fresh?.status})`);
      }
      const count = await countEligiblePersons(this.prisma, fresh);
      const o = await tx.vote.update({
        where: { id },
        data: { status: 'open', eligibleCountSnapshot: count, opensAt: fresh.opensAt > new Date() ? fresh.opensAt : new Date() },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'opened',
          entityType: 'Vote',
          entityId: id,
          changes: { after: { status: 'open', eligibleCountSnapshot: count } } as any,
        },
      });
      return o;
    });

    // Notify eligible voters that a vote has opened (in-app + push + email).
    const recipientUserIds = await this.voterUserIds(orgId, opened.eligibilityRule);
    if (recipientUserIds.length > 0) {
      await this.notifications.enqueueFor({
        organizationId: orgId,
        recipientUserIds,
        type: 'vote_opened',
        title: `New vote: ${opened.title}`,
        body: (opened.description || 'A new vote is open.').slice(0, 280),
        entityType: 'Vote',
        entityId: opened.id,
        actionUrl: `/votes/${opened.id}`,
        alsoEmail: {
          subject: `New vote: ${opened.title}`,
          message: `${opened.description || 'A new vote is now open.'}\n\nVoting closes ${new Date(opened.closesAt).toLocaleString()}.`,
          ctaLabel: 'Cast your vote',
          ctaUrl: `${RESIDENT_BASE}/votes/${opened.id}`,
        },
      });
    }

    return opened;
  }

  async close(id: string, orgId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.vote.findFirst({ where: { id, organizationId: orgId } });
      if (!v) throw new NotFoundException('Vote not found');
      if (!ALLOWED_TRANSITIONS[v.status]?.includes('closed')) {
        throw new ConflictException(`Cannot close vote in status ${v.status}`);
      }

      // Compute outcome
      const ballotCount = await tx.ballot.count({ where: { voteId: id } });
      const eligible = v.eligibleCountSnapshot ?? ballotCount;
      const quorumThreshold = Math.max(1, Math.ceil((v.quorumPercent / 100) * eligible));
      let outcome: 'passed' | 'failed' | 'quorum_not_met';

      if (ballotCount < quorumThreshold) {
        outcome = 'quorum_not_met';
      } else {
        // Tally selections per option
        const ballots = await tx.ballot.findMany({ where: { voteId: id }, select: { selectedOptionIds: true } });
        const optionTotals = new Map<string, number>();
        for (const b of ballots) {
          for (const optId of b.selectedOptionIds) {
            optionTotals.set(optId, (optionTotals.get(optId) ?? 0) + 1);
          }
        }
        // For a yes/no vote we need at least one option called 'yes' / first option as proxy.
        // PRD's general voting tally: first option wins if it beats passThreshold of cast.
        const options = (v.options as any[]) || [];
        const firstId = options[0]?.id;
        const firstCount = firstId ? optionTotals.get(firstId) ?? 0 : 0;
        const requiredYes = Math.ceil((v.passThresholdPercent / 100) * ballotCount);
        outcome = firstCount >= requiredYes ? 'passed' : 'failed';
      }

      const closed = await tx.vote.update({
        where: { id },
        data: { status: 'closed', closedAt: new Date(), outcome },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'closed',
          entityType: 'Vote',
          entityId: id,
          changes: { after: { status: 'closed', outcome, ballotCount } } as any,
        },
      });
      return closed;
    });
  }

  async cancel(id: string, orgId: string, actor: Actor, reason?: string) {
    const v = await this.prisma.vote.findFirst({ where: { id, organizationId: orgId } });
    if (!v) throw new NotFoundException('Vote not found');
    if (!ALLOWED_TRANSITIONS[v.status]?.includes('cancelled')) {
      throw new ConflictException(`Cannot cancel vote in status ${v.status}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vote.update({ where: { id }, data: { status: 'cancelled' } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'cancelled',
          entityType: 'Vote',
          entityId: id,
          changes: { before: { status: v.status }, after: { status: 'cancelled' }, reason } as any,
        },
      });
      return updated;
    });
  }

  // ---------- Ballots ----------

  async castBallot(voteId: string, orgId: string, actor: Actor, dto: CastBallotDto) {
    const v = await this.prisma.vote.findFirst({ where: { id: voteId, organizationId: orgId } });
    if (!v) throw new NotFoundException('Vote not found');
    if (v.status !== 'open') throw new ConflictException(`Vote not open (currently ${v.status})`);
    if (new Date() > v.closesAt) throw new ConflictException('Voting has closed');

    // Resolve the person whose vote this is
    let voterPersonId: string;
    let viaProxy = false;
    if (dto.asProxyForPersonId) {
      if (!v.proxyAllowed) throw new ConflictException('Proxy voting not allowed for this vote');
      const proxy = await this.prisma.voteProxy.findFirst({
        where: {
          voteId,
          grantorPersonId: dto.asProxyForPersonId,
          granteeUserId: actor.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!proxy) throw new ForbiddenException('No valid proxy from that person to you');
      // Prevent proxy-chain: the proxy holder must NOT themselves be acting under a delegated proxy in this same call
      voterPersonId = dto.asProxyForPersonId;
      viaProxy = true;
    } else {
      const me = await findPersonForUser(this.prisma, actor.userId, orgId);
      if (!me) throw new ForbiddenException('You are not registered as a person in this organisation');
      voterPersonId = me.id;
    }

    // Validate options against vote.options
    const validIds = new Set(((v.options as any[]) || []).map((o) => o.id));
    for (const id of dto.selectedOptionIds) {
      if (!validIds.has(id)) throw new BadRequestException(`Unknown option: ${id}`);
    }
    if (!v.allowMultiple && dto.selectedOptionIds.length !== 1) {
      throw new BadRequestException('This vote allows a single option only');
    }

    // Live eligibility check
    const eligibility = await isPersonEligible(this.prisma, v, voterPersonId);
    if (!eligibility.eligible) {
      throw new ForbiddenException(`Not eligible to vote: ${eligibility.reason}`);
    }

    // Cast — DB unique constraint enforces one-person-one-vote
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ballotData: any = {
          voteId,
          castByUserId: actor.userId,
          selectedOptionIds: dto.selectedOptionIds,
        };
        if (v.anonymous) {
          ballotData.anonymousHash = computeAnonymousHash(voteId, voterPersonId);
          // voterPersonId left null
        } else {
          ballotData.voterPersonId = voterPersonId;
        }

        const ballot = await tx.ballot.create({ data: ballotData });
        // For anonymous votes we MUST NOT write an AuditLog row tied to the actor —
        // correlating AuditLog.actorId + AuditLog.createdAt with Ballot.castAt would
        // re-identify the voter. The Ballot row itself (with anonymousHash) is the
        // audit. For non-anonymous votes we write the usual audit row.
        if (!v.anonymous) {
          await tx.auditLog.create({
            data: {
              organizationId: orgId,
              actorId: actor.userId,
              actorRole: actor.role,
              action: viaProxy ? 'ballot_cast_proxy' : 'ballot_cast',
              entityType: 'Vote',
              entityId: voteId,
              changes: { ballotId: ballot.id, viaProxy } as any,
            },
          });
        }
        return { id: ballot.id, anonymous: v.anonymous, castAt: ballot.castAt };
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('You have already voted in this poll');
      }
      throw err;
    }
  }

  async grantProxy(voteId: string, orgId: string, actor: Actor, dto: GrantProxyDto) {
    const v = await this.prisma.vote.findFirst({ where: { id: voteId, organizationId: orgId } });
    if (!v) throw new NotFoundException('Vote not found');
    if (!v.proxyAllowed) throw new ConflictException('Proxy voting not allowed for this vote');
    if (v.status !== 'open' && v.status !== 'draft') {
      throw new ConflictException('Cannot grant proxy on a closed/cancelled vote');
    }

    const grantor = await findPersonForUser(this.prisma, actor.userId, orgId);
    if (!grantor) throw new ForbiddenException('You are not a registered person in this organisation');

    if (dto.granteeUserId === actor.userId) {
      throw new BadRequestException('Cannot grant a proxy to yourself');
    }

    // Prevent proxy chain: the grantee must not themselves be acting under a proxy in this vote
    const granteePerson = await findPersonForUser(this.prisma, dto.granteeUserId, orgId);
    if (granteePerson) {
      const existingProxyToGrantee = await this.prisma.voteProxy.findFirst({
        where: { voteId, granteeUserId: dto.granteeUserId, revokedAt: null },
      });
      // It's fine if the grantee already holds a proxy from someone else — they can hold multiple.
      // We only block A→B→C chains by requiring proxies to point at humans, not at proxy-holders' proxy.
      // (The proxy holder must cast as themselves OR as one specific grantor; never chain further.)
      void existingProxyToGrantee;
    }

    try {
      const expiresAt = new Date(v.closesAt);
      return await this.prisma.voteProxy.create({
        data: {
          voteId,
          grantorPersonId: grantor.id,
          granteeUserId: dto.granteeUserId,
          expiresAt,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('You have already granted a proxy on this vote');
      }
      throw err;
    }
  }

  async revokeProxy(proxyId: string, orgId: string, actor: Actor) {
    const proxy = await this.prisma.voteProxy.findFirst({
      where: { id: proxyId, vote: { organizationId: orgId } },
      include: { vote: true },
    });
    if (!proxy) throw new NotFoundException('Proxy not found');
    const me = await findPersonForUser(this.prisma, actor.userId, orgId);
    if (!me || me.id !== proxy.grantorPersonId) throw new ForbiddenException();

    // If grantee already cast on behalf, can't revoke retroactively
    const castUnderProxy = await this.prisma.ballot.findFirst({
      where: { voteId: proxy.voteId, voterPersonId: proxy.grantorPersonId },
    });
    if (castUnderProxy) {
      throw new ConflictException('Proxy already used — cannot revoke after the ballot was cast');
    }

    return this.prisma.voteProxy.update({
      where: { id: proxyId },
      data: { revokedAt: new Date() },
    });
  }

  // ---------- Results ----------

  async results(voteId: string, orgId: string, actor: Actor) {
    const v = await this.prisma.vote.findFirst({ where: { id: voteId, organizationId: orgId } });
    if (!v) throw new NotFoundException('Vote not found');

    const adminView = !isResidentRole(actor.role);
    if (!adminView && v.status !== 'closed' && !v.resultsLiveVisible) {
      throw new ForbiddenException('Results hidden until vote closes');
    }

    const ballotCount = await this.prisma.ballot.count({ where: { voteId } });
    const ballots = await this.prisma.ballot.findMany({
      where: { voteId },
      select: { selectedOptionIds: true },
    });
    const tally = new Map<string, number>();
    for (const b of ballots) {
      for (const id of b.selectedOptionIds) {
        tally.set(id, (tally.get(id) ?? 0) + 1);
      }
    }
    const eligible = v.eligibleCountSnapshot ?? 0;
    const quorumPct = eligible > 0 ? (ballotCount / eligible) * 100 : 0;

    return {
      success: true,
      data: {
        voteId: v.id,
        status: v.status,
        outcome: v.outcome,
        ballotCount,
        eligibleCount: eligible,
        quorumPercent: v.quorumPercent,
        passThresholdPercent: v.passThresholdPercent,
        quorumMet: quorumPct >= v.quorumPercent,
        options: ((v.options as any[]) || []).map((o: any) => ({
          id: o.id,
          label: o.label,
          count: tally.get(o.id) ?? 0,
          pct: ballotCount > 0 ? ((tally.get(o.id) ?? 0) / ballotCount) * 100 : 0,
        })),
      },
    };
  }
}
