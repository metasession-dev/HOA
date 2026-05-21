import { Tool, BOARD_ROLES } from './types';

/**
 * Governance tools — votes, surveys, board insights.
 */

const activeVotes: Tool = {
  name: 'governance_active_votes',
  domain: 'governance',
  description:
    'List currently-open votes (status=open) with their quorum + threshold + close date. Use for "what votes are running", "any open motions".',
  parameters: { type: 'object', properties: {} },
  allowedRoles: BOARD_ROLES,
  async execute(_args, { actor, prisma }) {
    const rows = await prisma.vote.findMany({
      where: { organizationId: actor.organizationId, status: 'open' },
      select: {
        id: true, title: true, type: true, opensAt: true, closesAt: true,
        quorumPercent: true, passThresholdPercent: true,
        _count: { select: { ballots: true } },
      },
      orderBy: { closesAt: 'asc' },
    });
    return {
      data: rows.map((r) => ({ ...r, ballotsCast: r._count.ballots })),
      summary: `${rows.length} vote${rows.length === 1 ? '' : 's'} currently open`,
    };
  },
};

const voteOutcome: Tool = {
  name: 'governance_vote_outcome',
  domain: 'governance',
  description:
    'Look up a specific vote\'s tally + outcome. Use for "did motion X pass", "results of last AGM".',
  parameters: {
    type: 'object',
    properties: {
      voteId: { type: 'string', description: 'Cuid of the vote (preferred).' },
      title: { type: 'string', description: 'Substring match against vote title if id unknown.' },
    },
  },
  allowedRoles: BOARD_ROLES,
  async execute(args, { actor, prisma }) {
    const where: any = { organizationId: actor.organizationId };
    if (args.voteId) where.id = args.voteId;
    else if (args.title) where.title = { contains: args.title, mode: 'insensitive' };
    else return { data: null, summary: 'Provide voteId or title to look up.' };
    const vote = await prisma.vote.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, status: true, outcome: true,
        quorumPercent: true, passThresholdPercent: true,
        opensAt: true, closesAt: true, closedAt: true,
        ballots: { select: { selectedOptionIds: true } },
      },
    });
    if (!vote) return { data: null, summary: 'No matching vote found.' };
    // Tally by option.
    const tally: Record<string, number> = {};
    for (const b of vote.ballots) {
      for (const optId of b.selectedOptionIds) tally[optId] = (tally[optId] ?? 0) + 1;
    }
    return {
      data: { ...vote, ballots: undefined, ballotsCast: vote.ballots.length, tally },
      summary: vote.outcome
        ? `"${vote.title}" — ${vote.outcome} (${vote.ballots.length} ballots)`
        : `"${vote.title}" — ${vote.status} (${vote.ballots.length} ballots so far)`,
    };
  },
};

const surveysActive: Tool = {
  name: 'governance_surveys_active',
  domain: 'governance',
  description:
    'List open surveys with response counts. Use for "any active surveys", "how is participation".',
  parameters: { type: 'object', properties: {} },
  allowedRoles: BOARD_ROLES,
  async execute(_args, { actor, prisma }) {
    const rows = await prisma.survey.findMany({
      where: { organizationId: actor.organizationId, status: 'open' },
      select: {
        id: true, title: true, opensAt: true, closesAt: true, anonymous: true,
        _count: { select: { responses: true } },
      },
      orderBy: { closesAt: 'asc' },
    });
    return {
      data: rows.map((r) => ({ ...r, responses: r._count.responses })),
      summary: `${rows.length} survey${rows.length === 1 ? '' : 's'} currently open`,
    };
  },
};

export const GOVERNANCE_TOOLS: Tool[] = [
  activeVotes,
  voteOutcome,
  surveysActive,
];
