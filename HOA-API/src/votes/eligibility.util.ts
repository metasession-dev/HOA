import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';

/**
 * Anonymous-ballot hash. We never store the (voteId, personId) pair when
 * anonymous=true; instead we store sha256 of those two values plus a server
 * secret. This lets us enforce one-person-one-vote at the DB level without
 * revealing how a specific person voted.
 *
 * The secret lives in env VOTE_ANONYMITY_SECRET; falls back to JWT_SECRET +
 * a salt if unset (with a warning logged once at startup).
 */
let cachedSecret: string | null = null;
export function getAnonymitySecret(): string {
  if (cachedSecret) return cachedSecret;
  const explicit = process.env.VOTE_ANONYMITY_SECRET;
  if (explicit && explicit.length >= 32) {
    cachedSecret = explicit;
    return cachedSecret;
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[votes] VOTE_ANONYMITY_SECRET missing or too short; falling back to JWT_SECRET-derived value. ' +
      'Set VOTE_ANONYMITY_SECRET (>=32 chars) in production for tamper-evident anonymous ballots.',
  );
  cachedSecret = `vote-anon::${process.env.JWT_SECRET || 'dev-secret-change-me'}`;
  return cachedSecret;
}

export function computeAnonymousHash(voteId: string, personId: string): string {
  const secret = getAnonymitySecret();
  return crypto.createHmac('sha256', secret).update(`${voteId}::${personId}`).digest('hex');
}

/**
 * Person → User → resident occupancy resolution.
 * Returns the Person record for the actor (resident) within the org, or null.
 */
export async function findPersonForUser(
  prisma: PrismaService,
  userId: string,
  orgId: string,
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  return prisma.person.findFirst({
    where: { userId, organizationId: orgId },
    select: { id: true, firstName: true, lastName: true },
  });
}

/**
 * Live eligibility check for a (vote, person) pair.
 * Re-evaluated at cast time so people can't game by paying-up post-snapshot
 * AND we honour the org's current state-of-record.
 */
export async function isPersonEligible(
  prisma: PrismaService,
  vote: any,
  personId: string,
): Promise<{ eligible: boolean; reason?: string }> {
  // Must have an active occupancy with a role matching the rule
  const occupancy = await prisma.unitOccupancy.findFirst({
    where: { personId, isActive: true },
    include: { unit: { include: { estate: true } } },
  });
  if (!occupancy) return { eligible: false, reason: 'no_active_occupancy' };
  if (occupancy.unit.estate.organizationId !== vote.organizationId) {
    return { eligible: false, reason: 'wrong_organization' };
  }

  switch (vote.eligibilityRule) {
    case 'all_residents':
      return { eligible: true };
    case 'all_owners':
      if (occupancy.role !== 'owner') return { eligible: false, reason: 'not_owner' };
      return { eligible: true };
    case 'paid_up_only': {
      if (occupancy.role !== 'owner') return { eligible: false, reason: 'not_owner' };
      const maxOverdue = (vote.eligibilityFilter as any)?.maxOverdue ?? 0;
      const outstanding = await prisma.invoice.aggregate({
        _sum: { amount: true },
        where: {
          unitId: occupancy.unitId,
          organizationId: vote.organizationId,
          status: { in: ['sent', 'partial', 'overdue'] },
          dueDate: { lt: new Date() },
        },
      });
      const total = Number(outstanding._sum.amount || 0);
      if (total > maxOverdue) return { eligible: false, reason: 'has_arrears' };
      return { eligible: true };
    }
    case 'tag_match': {
      const requiredTag = (vote.eligibilityFilter as any)?.tagSlug as string | undefined;
      if (!requiredTag) return { eligible: false, reason: 'tag_rule_unconfigured' };
      const unitTags = occupancy.unit.tags || [];
      if (!unitTags.includes(requiredTag)) return { eligible: false, reason: 'tag_mismatch' };
      return { eligible: true };
    }
    default:
      return { eligible: false, reason: 'unknown_rule' };
  }
}

/**
 * Count how many distinct persons are eligible for this vote in its current
 * org state. Used at open-time to snapshot quorum baseline.
 */
export async function countEligiblePersons(prisma: PrismaService, vote: any): Promise<number> {
  // Materialise the eligibility check across all active owners/residents.
  const candidates = await prisma.unitOccupancy.findMany({
    where: { isActive: true, unit: { estate: { organizationId: vote.organizationId } } },
    select: { personId: true, role: true, unitId: true },
  });
  const distinct = new Set<string>();
  for (const c of candidates) {
    // Quick filters for cheap eligibility
    if (vote.eligibilityRule === 'all_owners' && c.role !== 'owner') continue;
    if (vote.eligibilityRule === 'paid_up_only' && c.role !== 'owner') continue;
    distinct.add(c.personId);
  }
  // For paid_up_only and tag_match, we don't pre-check the constraint here.
  // That keeps quorum stable across the vote window even if people pay/unpay.
  // Eligibility is still re-checked at cast time (so non-payers can't actually vote).
  return distinct.size;
}
