import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';

export type Actor = { userId: string; role: string };

const VALID_FUND_TYPES = ['operating', 'reserve', 'sinking', 'special_levy'] as const;

@Injectable()
export class FundsService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string) {
    const funds = await this.prisma.fund.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    // Compute current balance per fund: opening + sum(journal-line debits - credits)
    // for entries tagged with this fund (and entries with lines that carry a fundId).
    const balances = await this.computeBalances(orgId);
    return funds.map((f) => ({
      ...f,
      currentBalance: Number(
        new Decimal(f.openingBalance.toString()).add(balances[f.id] ?? new Decimal(0)).toFixed(2),
      ),
    }));
  }

  async findById(id: string, orgId: string) {
    const f = await this.prisma.fund.findFirst({ where: { id, organizationId: orgId } });
    if (!f) throw new NotFoundException('Fund not found');
    const balances = await this.computeBalances(orgId);
    return {
      ...f,
      currentBalance: Number(
        new Decimal(f.openingBalance.toString()).add(balances[id] ?? new Decimal(0)).toFixed(2),
      ),
    };
  }

  async create(
    orgId: string,
    actor: Actor,
    dto: { name: string; type: string; description?: string; openingBalance?: number },
  ) {
    if (!VALID_FUND_TYPES.includes(dto.type as any)) {
      throw new BadRequestException(`Invalid fund type. Must be one of: ${VALID_FUND_TYPES.join(', ')}`);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const f = await tx.fund.create({
          data: {
            organizationId: orgId,
            name: dto.name,
            type: dto.type,
            description: dto.description,
            openingBalance: new Decimal(dto.openingBalance ?? 0),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'created',
            entityType: 'Fund',
            entityId: f.id,
            changes: { after: f } as any,
          },
        });
        return f;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A fund named "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async update(
    id: string,
    orgId: string,
    actor: Actor,
    dto: { name?: string; description?: string; openingBalance?: number; isActive?: boolean },
  ) {
    const existing = await this.findById(id, orgId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const f = await tx.fund.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          openingBalance: dto.openingBalance !== undefined ? new Decimal(dto.openingBalance) : undefined,
          isActive: dto.isActive,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'updated',
          entityType: 'Fund',
          entityId: id,
          changes: { before: existing, after: f } as any,
        },
      });
      return f;
    });
    return updated;
  }

  /**
   * Sum journal-line balance changes per fundId. Looks at:
   *   - JournalEntry.fundId (entry-level tagging)
   *   - lines[].fundId (line-level tagging, overrides entry-level when set)
   * Returns map keyed by fundId of Decimal balance changes.
   */
  private async computeBalances(orgId: string): Promise<Record<string, Decimal>> {
    const entries = await this.prisma.journalEntry.findMany({
      where: { organizationId: orgId, postedAt: { not: null } },
      select: { fundId: true, lines: true },
    });
    const out: Record<string, Decimal> = {};
    for (const entry of entries) {
      const lines = Array.isArray(entry.lines) ? entry.lines : [];
      for (const line of lines as any[]) {
        if (!line) continue;
        const fundId: string | null = line.fundId ?? entry.fundId ?? null;
        if (!fundId) continue;
        const delta = new Decimal(line.debit ?? 0).minus(new Decimal(line.credit ?? 0));
        out[fundId] = (out[fundId] ?? new Decimal(0)).add(delta);
      }
    }
    return out;
  }
}
