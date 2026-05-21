import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { CreateCategorizationRuleDto, UpdateCategorizationRuleDto } from './dto/banking.dto';

export type Actor = { userId: string; role: string };

@Injectable()
export class CategorizationRulesService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string) {
    return this.prisma.categorizationRule.findMany({
      where: { organizationId: orgId },
      include: { glAccount: { select: { id: true, code: true, name: true } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(orgId: string, actor: Actor, dto: CreateCategorizationRuleDto) {
    this.validatePattern(dto.matchType ?? 'contains', dto.pattern);
    const gl = await this.prisma.gLAccount.findFirst({
      where: { id: dto.glAccountId, organizationId: orgId, isActive: true },
    });
    if (!gl) throw new BadRequestException('Invalid GL account');
    if (dto.fundId) {
      const f = await this.prisma.fund.findFirst({
        where: { id: dto.fundId, organizationId: orgId, isActive: true },
      });
      if (!f) throw new BadRequestException('Invalid fund');
    }
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.categorizationRule.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          matchType: dto.matchType ?? 'contains',
          pattern: dto.pattern,
          caseInsensitive: dto.caseInsensitive ?? true,
          amountMin: dto.amountMin !== undefined ? new Decimal(dto.amountMin) : null,
          amountMax: dto.amountMax !== undefined ? new Decimal(dto.amountMax) : null,
          glAccountId: dto.glAccountId,
          fundId: dto.fundId,
          priority: dto.priority ?? 100,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'created',
          entityType: 'CategorizationRule',
          entityId: r.id,
          changes: { after: r } as any,
        },
      });
      return r;
    });
  }

  async update(id: string, orgId: string, actor: Actor, dto: UpdateCategorizationRuleDto) {
    const existing = await this.prisma.categorizationRule.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Rule not found');
    if (dto.matchType || dto.pattern) {
      this.validatePattern(dto.matchType ?? existing.matchType, dto.pattern ?? existing.pattern);
    }
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.categorizationRule.update({
        where: { id },
        data: {
          name: dto.name,
          matchType: dto.matchType,
          pattern: dto.pattern,
          caseInsensitive: dto.caseInsensitive,
          amountMin: dto.amountMin !== undefined ? new Decimal(dto.amountMin) : undefined,
          amountMax: dto.amountMax !== undefined ? new Decimal(dto.amountMax) : undefined,
          glAccountId: dto.glAccountId,
          fundId: dto.fundId,
          priority: dto.priority,
          isActive: dto.isActive,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'updated',
          entityType: 'CategorizationRule',
          entityId: id,
          changes: { before: existing, after: r } as any,
        },
      });
      return r;
    });
  }

  async remove(id: string, orgId: string, actor: Actor) {
    const existing = await this.prisma.categorizationRule.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Rule not found');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.categorizationRule.update({
        where: { id },
        data: { isActive: false },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'soft_deleted',
          entityType: 'CategorizationRule',
          entityId: id,
          changes: {} as any,
        },
      });
      return r;
    });
  }

  /**
   * Pure matcher — used by the BankTransactionsService to auto-categorize on import.
   * Returns the highest-priority matching rule or null.
   */
  matchTransaction(
    rules: Array<{ matchType: string; pattern: string; caseInsensitive: boolean; amountMin: Decimal | null; amountMax: Decimal | null; glAccountId: string; fundId: string | null; id: string; priority: number; isActive: boolean }>,
    tx: { description: string; amount: Decimal },
  ): { ruleId: string; glAccountId: string; fundId: string | null } | null {
    const active = rules
      .filter((r) => r.isActive)
      .sort((a, b) => a.priority - b.priority);

    for (const r of active) {
      // Amount range check
      const amt = tx.amount;
      if (r.amountMin && amt.lessThan(r.amountMin)) continue;
      if (r.amountMax && amt.greaterThan(r.amountMax)) continue;

      const haystack = r.caseInsensitive ? tx.description.toLowerCase() : tx.description;
      const needle = r.caseInsensitive ? r.pattern.toLowerCase() : r.pattern;

      let hit = false;
      try {
        if (r.matchType === 'contains') {
          hit = haystack.includes(needle);
        } else if (r.matchType === 'starts_with') {
          hit = haystack.startsWith(needle);
        } else if (r.matchType === 'equals') {
          hit = haystack === needle;
        } else if (r.matchType === 'regex') {
          const flags = r.caseInsensitive ? 'i' : '';
          hit = new RegExp(r.pattern, flags).test(tx.description);
        }
      } catch {
        // Malformed regex etc — skip this rule rather than crash the import
        continue;
      }
      if (hit) return { ruleId: r.id, glAccountId: r.glAccountId, fundId: r.fundId };
    }
    return null;
  }

  private validatePattern(matchType: string, pattern: string) {
    if (pattern.length > 500) {
      throw new BadRequestException('Pattern too long (max 500 chars)');
    }
    if (matchType === 'regex') {
      try {
        new RegExp(pattern);
      } catch (err: any) {
        throw new BadRequestException(`Invalid regex: ${err.message}`);
      }
      // Structural guard: reject the well-known ReDoS shapes — nested quantifiers
      // ("evil regex") like (a+)+, (a*)+, (a|aa)+, plus excessive alternation.
      // Conservative heuristic: refuse if a closing paren is immediately followed
      // by + or *, AND the group contains an unbounded quantifier itself.
      const evilNested = /\([^)]*[+*][^)]*\)\s*[+*]/;
      if (evilNested.test(pattern)) {
        throw new BadRequestException(
          'Pattern looks vulnerable to catastrophic backtracking (nested unbounded quantifiers). Simplify or use a non-regex match type.',
        );
      }
      // Cap alternation count to keep matching cost predictable
      const alternations = (pattern.match(/\|/g) || []).length;
      if (alternations > 20) {
        throw new BadRequestException('Too many alternations (|) — max 20');
      }
    }
  }
}
