import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto/banking.dto';

export type Actor = { userId: string; role: string };

@Injectable()
export class BankAccountsService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { organizationId: orgId },
      include: { glAccount: { select: { id: true, code: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    // Current balance per account: opening + sum of all transactions (positive=in, negative=out)
    const ids = accounts.map((a) => a.id);
    const txGroups = await this.prisma.bankTransaction.groupBy({
      by: ['bankAccountId'],
      where: { bankAccountId: { in: ids } },
      _sum: { amount: true },
    });
    const sumByAccount = new Map<string, Decimal>();
    for (const g of txGroups) {
      sumByAccount.set(g.bankAccountId, new Decimal(g._sum.amount?.toString() ?? '0'));
    }
    return accounts.map((a) => {
      const opening = new Decimal(a.openingBalance.toString());
      const movements = sumByAccount.get(a.id) ?? new Decimal(0);
      return {
        ...a,
        currentBalance: Number(opening.add(movements).toFixed(2)),
      };
    });
  }

  async findById(id: string, orgId: string) {
    const a = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId: orgId },
      include: { glAccount: true },
    });
    if (!a) throw new NotFoundException('Bank account not found');
    const movements = await this.prisma.bankTransaction.aggregate({
      where: { bankAccountId: id },
      _sum: { amount: true },
    });
    const opening = new Decimal(a.openingBalance.toString());
    const sum = new Decimal(movements._sum.amount?.toString() ?? '0');
    return { ...a, currentBalance: Number(opening.add(sum).toFixed(2)) };
  }

  async create(orgId: string, actor: Actor, dto: CreateBankAccountDto) {
    const gl = await this.prisma.gLAccount.findFirst({
      where: { id: dto.glAccountId, organizationId: orgId, isActive: true },
    });
    if (!gl) throw new BadRequestException('Invalid GL account');
    if (gl.type !== 'asset') {
      throw new BadRequestException('Bank accounts must map to an asset-type GL account');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const a = await tx.bankAccount.create({
          data: {
            organizationId: orgId,
            name: dto.name,
            bankName: dto.bankName,
            accountNumber: dto.accountNumber ? dto.accountNumber.slice(-4) : undefined, // store last 4 only
            currency: dto.currency ?? 'ZAR',
            glAccountId: dto.glAccountId,
            openingBalance: new Decimal(dto.openingBalance ?? 0),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'created',
            entityType: 'BankAccount',
            entityId: a.id,
            changes: { after: a } as any,
          },
        });
        return a;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A bank account named "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, orgId: string, actor: Actor, dto: UpdateBankAccountDto) {
    const existing = await this.findById(id, orgId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bankAccount.update({
        where: { id },
        data: {
          name: dto.name,
          bankName: dto.bankName,
          accountNumber: dto.accountNumber ? dto.accountNumber.slice(-4) : undefined,
          isActive: dto.isActive,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'updated',
          entityType: 'BankAccount',
          entityId: id,
          changes: { before: existing, after: updated } as any,
        },
      });
      return updated;
    });
  }
}
