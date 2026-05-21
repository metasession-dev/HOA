import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, ApprovalRule } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import {
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
} from './dto/vendors.dto';
import { Decimal } from '@prisma/client/runtime/library';

export type Actor = { userId: string; role: string };

const VALID_ROLES = [
  'finance_officer',
  'exco_member',
  'exco_chairperson',
  'hoa_admin',
  'super_admin',
];

@Injectable()
export class ApprovalRulesService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string) {
    return this.prisma.approvalRule.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string, orgId: string) {
    const rule = await this.prisma.approvalRule.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!rule) throw new NotFoundException('Approval rule not found');
    return rule;
  }

  async create(orgId: string, actor: Actor, dto: CreateApprovalRuleDto) {
    this.validateRoles(dto.requiredRoles);
    this.validateAmounts(dto.minAmount, dto.maxAmount);
    const created = await this.prisma.$transaction(async (tx) => {
      const r = await tx.approvalRule.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          minAmount: dto.minAmount !== undefined ? new Decimal(dto.minAmount) : null,
          maxAmount: dto.maxAmount !== undefined ? new Decimal(dto.maxAmount) : null,
          currency: dto.currency ?? 'ZAR',
          glAccountIds: dto.glAccountIds ?? [],
          requiredRoles: dto.requiredRoles,
          approverCount: dto.approverCount ?? 1,
          mode: dto.mode ?? 'any',
          priority: dto.priority ?? 100,
          isActive: dto.isActive ?? true,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'created',
          entityType: 'ApprovalRule',
          entityId: r.id,
          changes: { after: r } as any,
        },
      });
      return r;
    });
    return created;
  }

  async update(id: string, orgId: string, actor: Actor, dto: UpdateApprovalRuleDto) {
    const existing = await this.findById(id, orgId);
    if (dto.requiredRoles) this.validateRoles(dto.requiredRoles);
    this.validateAmounts(dto.minAmount, dto.maxAmount);
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.approvalRule.update({
        where: { id },
        data: {
          name: dto.name,
          minAmount: dto.minAmount !== undefined ? new Decimal(dto.minAmount) : undefined,
          maxAmount: dto.maxAmount !== undefined ? new Decimal(dto.maxAmount) : undefined,
          currency: dto.currency,
          glAccountIds: dto.glAccountIds,
          requiredRoles: dto.requiredRoles,
          approverCount: dto.approverCount,
          mode: dto.mode,
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
          entityType: 'ApprovalRule',
          entityId: r.id,
          changes: { before: existing, after: r } as any,
        },
      });
      return r;
    });
    return updated;
  }

  /** Soft-delete: set isActive=false. We never hard-delete a rule that may be referenced by historical Approval rows. */
  async remove(id: string, orgId: string, actor: Actor) {
    const existing = await this.findById(id, orgId);
    if (!existing.isActive) return existing;
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.approvalRule.update({
        where: { id },
        data: { isActive: false },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'soft_deleted',
          entityType: 'ApprovalRule',
          entityId: r.id,
          changes: {} as any,
        },
      });
      return r;
    });
    return updated;
  }

  /** Match the highest-priority (lowest priority number) rule for the given invoice. */
  async selectFor(
    orgId: string,
    invoice: { amount: number | Decimal; currency: string; glAccountId?: string | null },
    tx?: Prisma.TransactionClient,
  ): Promise<ApprovalRule | null> {
    const client = tx ?? this.prisma;
    const amount =
      typeof invoice.amount === 'number' ? invoice.amount : Number(invoice.amount.toString());
    const candidates = await client.approvalRule.findMany({
      where: { organizationId: orgId, isActive: true, currency: invoice.currency },
      orderBy: { priority: 'asc' },
    });
    for (const rule of candidates) {
      const min = rule.minAmount ? Number(rule.minAmount.toString()) : Number.NEGATIVE_INFINITY;
      const max = rule.maxAmount ? Number(rule.maxAmount.toString()) : Number.POSITIVE_INFINITY;
      if (amount < min || amount > max) continue;
      if (rule.glAccountIds.length > 0) {
        if (!invoice.glAccountId || !rule.glAccountIds.includes(invoice.glAccountId)) continue;
      }
      return rule;
    }
    return null;
  }

  private validateRoles(roles: string[]) {
    if (!roles || roles.length === 0) {
      throw new BadRequestException('At least one required role must be specified');
    }
    for (const r of roles) {
      if (!VALID_ROLES.includes(r)) {
        throw new BadRequestException(`Unknown role: ${r}`);
      }
    }
  }

  private validateAmounts(minAmount?: number, maxAmount?: number) {
    if (
      minAmount !== undefined &&
      maxAmount !== undefined &&
      minAmount > maxAmount
    ) {
      throw new BadRequestException('minAmount must be <= maxAmount');
    }
  }
}
