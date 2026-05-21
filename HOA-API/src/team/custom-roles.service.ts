import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from './dto/team.dto';
import { isValidPermission } from './permissions';

export type Actor = { userId: string; role: string };

@Injectable()
export class CustomRolesService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string) {
    const roles = await this.prisma.customRole.findMany({
      where: { organizationId: orgId },
      orderBy: { displayName: 'asc' },
    });
    // Append assignment count for the UI
    const counts = await this.prisma.userRole.groupBy({
      by: ['customRoleId'],
      where: { organizationId: orgId, customRoleId: { in: roles.map((r) => r.id) } },
      _count: true,
    });
    const countById = new Map(counts.map((c) => [c.customRoleId, c._count]));
    return roles.map((r) => ({ ...r, assignedCount: countById.get(r.id) ?? 0 }));
  }

  async findById(id: string, orgId: string) {
    const r = await this.prisma.customRole.findFirst({ where: { id, organizationId: orgId } });
    if (!r) throw new NotFoundException('Custom role not found');
    return r;
  }

  async create(orgId: string, actor: Actor, dto: CreateCustomRoleDto) {
    this.validatePermissions(dto.permissions);
    await this.assertActorHasPermissions(orgId, actor, dto.permissions);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const r = await tx.customRole.create({
          data: {
            organizationId: orgId,
            name: dto.name,
            displayName: dto.displayName,
            description: dto.description,
            permissions: dto.permissions,
            defaultApprovalLimit: dto.defaultApprovalLimit !== undefined ? new Decimal(dto.defaultApprovalLimit) : null,
            createdBy: actor.userId,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'created',
            entityType: 'CustomRole',
            entityId: r.id,
            changes: { name: dto.name, permissions: dto.permissions } as any,
          },
        });
        return r;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(`A custom role named "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, orgId: string, actor: Actor, dto: UpdateCustomRoleDto) {
    if (dto.permissions) {
      this.validatePermissions(dto.permissions);
      await this.assertActorHasPermissions(orgId, actor, dto.permissions);
    }
    const existing = await this.findById(id, orgId);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.customRole.update({
        where: { id },
        data: {
          displayName: dto.displayName,
          description: dto.description,
          permissions: dto.permissions,
          defaultApprovalLimit: dto.defaultApprovalLimit !== undefined ? new Decimal(dto.defaultApprovalLimit) : undefined,
          isActive: dto.isActive,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'updated',
          entityType: 'CustomRole',
          entityId: id,
          changes: { before: existing, after: r } as any,
        },
      });
      return r;
    });
  }

  async remove(id: string, orgId: string, actor: Actor) {
    const existing = await this.findById(id, orgId);
    if (!existing.isActive) return existing;
    // Hard guard: refuse if there are active assignments
    const assignments = await this.prisma.userRole.count({ where: { customRoleId: id } });
    if (assignments > 0) {
      throw new ConflictException(
        `Cannot deactivate: ${assignments} active assignment(s). Revoke them first.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.customRole.update({ where: { id }, data: { isActive: false } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'soft_deleted',
          entityType: 'CustomRole',
          entityId: id,
          changes: {} as any,
        },
      });
      return r;
    });
  }

  /**
   * Permission-subset rule: an actor can only put permissions into a CustomRole
   * that they themselves currently hold. System admins (`hoa_admin`,
   * `super_admin`) hold everything implicitly. Anyone else must source the
   * permissions from their own CustomRole assignments.
   */
  private async assertActorHasPermissions(orgId: string, actor: Actor, requested: string[]) {
    if (['hoa_admin', 'super_admin'].includes(actor.role)) return;
    const myAssignments = await this.prisma.userRole.findMany({
      where: { userId: actor.userId, organizationId: orgId },
      include: { customRole: true },
    });
    const myPerms = new Set<string>();
    for (const ur of myAssignments) {
      if (ur.customRole) for (const p of ur.customRole.permissions) myPerms.add(p);
    }
    const missing = requested.filter((p) => !myPerms.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Cannot include permissions you do not hold: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? `, +${missing.length - 5} more` : ''}`,
      );
    }
  }

  private validatePermissions(perms: string[]) {
    if (!Array.isArray(perms) || perms.length === 0) {
      throw new BadRequestException('At least one permission is required');
    }
    const unknown = perms.filter((p) => !isValidPermission(p));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
    }
    // Reject any obviously misused string injection
    for (const p of perms) {
      if (p.length > 80 || !/^[a-z0-9_.]+$/.test(p)) {
        throw new BadRequestException(`Permission "${p}" has an invalid shape`);
      }
    }
  }
}
