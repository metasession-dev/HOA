import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { AssignRoleDto, UpdateUserRoleDto, SYSTEM_ROLE_NAMES } from './dto/team.dto';

export type Actor = { userId: string; role: string };

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService) {}

  /** List users with any role in this org. Excludes residents (owner/tenant) by default. */
  async list(
    orgId: string,
    query: { search?: string; includeResidents?: string; includeInactive?: string },
  ) {
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        organizationId: orgId,
        ...(query.includeResidents === 'true' ? {} : {
          role: { name: { notIn: ['owner', 'tenant'] } },
        }),
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true, lastLoginAt: true } },
        role: { select: { id: true, name: true, displayName: true } },
        customRole: { select: { id: true, name: true, displayName: true } },
      },
      orderBy: { user: { lastName: 'asc' } },
    });

    // Group by user
    const byUser = new Map<string, any>();
    for (const ur of userRoles) {
      if (query.search) {
        const q = query.search.toLowerCase();
        const matches =
          ur.user.email.toLowerCase().includes(q) ||
          ur.user.firstName.toLowerCase().includes(q) ||
          ur.user.lastName.toLowerCase().includes(q);
        if (!matches) continue;
      }
      if (query.includeInactive !== 'true' && !ur.user.isActive) continue;

      const entry = byUser.get(ur.user.id) ?? {
        ...ur.user,
        roles: [] as any[],
      };
      entry.roles.push({
        userRoleId: ur.id,
        role: ur.role,
        customRole: ur.customRole,
        assignedAt: ur.assignedAt,
        assignedBy: ur.assignedBy,
        expiresAt: ur.expiresAt,
        unitIds: ur.unitIds,
        estateIds: ur.estateIds,
        approvalLimit: ur.approvalLimit ? Number(ur.approvalLimit.toString()) : null,
      });
      byUser.set(ur.user.id, entry);
    }
    return Array.from(byUser.values());
  }

  /** Assign a (possibly time-bound, possibly scoped) role to a user. */
  async assignRole(orgId: string, actor: Actor, dto: AssignRoleDto) {
    if (!dto.roleName && !dto.customRoleId) {
      throw new BadRequestException('Must specify either roleName or customRoleId');
    }
    if (dto.roleName && dto.customRoleId) {
      throw new BadRequestException('Specify only one of roleName or customRoleId');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: dto.userId } });
      if (!user) throw new NotFoundException('User not found');

      let roleId: string;
      if (dto.roleName) {
        const role = await tx.role.upsert({
          where: { name: dto.roleName },
          update: {},
          create: { name: dto.roleName, displayName: dto.roleName, permissions: [], isSystem: true },
        });
        roleId = role.id;
      } else {
        const cr = await tx.customRole.findFirst({
          where: { id: dto.customRoleId, organizationId: orgId, isActive: true },
        });
        if (!cr) throw new BadRequestException('Invalid custom role');
        const fallback = await tx.role.upsert({
          where: { name: 'tenant' },
          update: {},
          create: { name: 'tenant', displayName: 'Tenant', permissions: [], isSystem: true },
        });
        roleId = fallback.id;
      }

      // Prevent escalation: only admins can grant admin/super_admin
      if (
        (dto.roleName === 'hoa_admin' || dto.roleName === 'super_admin') &&
        !['hoa_admin', 'super_admin'].includes(actor.role)
      ) {
        throw new ForbiddenException('Only an existing admin can grant admin role');
      }

      const upserted = await tx.userRole.upsert({
        where: { userId_roleId_organizationId: { userId: dto.userId, roleId, organizationId: orgId } },
        update: {
          customRoleId: dto.customRoleId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          unitIds: dto.unitIds ?? [],
          estateIds: dto.estateIds ?? [],
          approvalLimit: dto.approvalLimit !== undefined ? new Decimal(dto.approvalLimit) : null,
        },
        create: {
          userId: dto.userId,
          roleId,
          organizationId: orgId,
          customRoleId: dto.customRoleId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          unitIds: dto.unitIds ?? [],
          estateIds: dto.estateIds ?? [],
          approvalLimit: dto.approvalLimit !== undefined ? new Decimal(dto.approvalLimit) : null,
          assignedBy: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'role_assigned',
          entityType: 'UserRole',
          entityId: upserted.id,
          changes: {
            userId: dto.userId, roleName: dto.roleName, customRoleId: dto.customRoleId,
            expiresAt: dto.expiresAt, unitIds: dto.unitIds, approvalLimit: dto.approvalLimit,
          } as any,
        },
      });
      return upserted;
    });
  }

  async updateUserRole(userRoleId: string, orgId: string, actor: Actor, dto: UpdateUserRoleDto) {
    return this.prisma.$transaction(async (tx) => {
      const ur = await tx.userRole.findFirst({ where: { id: userRoleId, organizationId: orgId } });
      if (!ur) throw new NotFoundException('Role assignment not found');
      const updated = await tx.userRole.update({
        where: { id: userRoleId },
        data: {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          unitIds: dto.unitIds,
          estateIds: dto.estateIds,
          approvalLimit: dto.approvalLimit !== undefined ? new Decimal(dto.approvalLimit) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'role_updated',
          entityType: 'UserRole',
          entityId: userRoleId,
          changes: { before: ur, after: updated } as any,
        },
      });
      return updated;
    });
  }

  async revokeRole(userRoleId: string, orgId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const ur = await tx.userRole.findFirst({
        where: { id: userRoleId, organizationId: orgId },
        include: { user: true, role: true },
      });
      if (!ur) throw new NotFoundException('Role assignment not found');
      // Last-admin guard applies to ANY revocation of an admin role, not just
      // self-revocation. If removing this assignment would leave the org with
      // zero admins, refuse — even another admin can't lock the org out.
      if (ur.role.name === 'hoa_admin' || ur.role.name === 'super_admin') {
        const otherAdmins = await tx.userRole.count({
          where: {
            organizationId: orgId,
            role: { name: { in: ['hoa_admin', 'super_admin'] } },
            id: { not: userRoleId },
          },
        });
        if (otherAdmins === 0) {
          throw new ConflictException('Cannot revoke the only admin role for this org');
        }
      }
      await tx.userRole.delete({ where: { id: userRoleId } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'role_revoked',
          entityType: 'UserRole',
          entityId: userRoleId,
          changes: { userId: ur.userId, roleName: ur.role.name } as any,
        },
      });
      return { ok: true };
    });
  }

  /**
   * Deactivate a user FROM THIS ORG. We do not flip the global `User.isActive`
   * flag — that would also lock the user out of any other organization they
   * belong to. Instead we delete this org's UserRole rows for the user. They
   * remain a User row globally and keep their access to other orgs.
   */
  async deactivateUser(userId: string, orgId: string, actor: Actor) {
    if (userId === actor.userId) {
      throw new ConflictException('Cannot deactivate your own user');
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      const rolesHere = await tx.userRole.findMany({
        where: { userId, organizationId: orgId },
        include: { role: true },
      });
      if (rolesHere.length === 0) {
        throw new NotFoundException('User does not belong to this organization');
      }
      // Last-admin guard: if the user holds the only admin role in the org,
      // refuse to remove it via deactivation.
      const userHasAdmin = rolesHere.some((r) => ['hoa_admin', 'super_admin'].includes(r.role.name));
      if (userHasAdmin) {
        const otherAdmins = await tx.userRole.count({
          where: {
            organizationId: orgId,
            role: { name: { in: ['hoa_admin', 'super_admin'] } },
            userId: { not: userId },
          },
        });
        if (otherAdmins === 0) {
          throw new ConflictException('Cannot deactivate the only admin in this org');
        }
      }
      await tx.userRole.deleteMany({ where: { userId, organizationId: orgId } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'user_deactivated_from_org',
          entityType: 'User',
          entityId: userId,
          changes: { email: user.email, removedRoles: rolesHere.map((r) => r.role.name) } as any,
        },
      });
      return { ok: true, removedRoles: rolesHere.length };
    });
  }

  async loginHistory(orgId: string, userId?: string, limit = 100) {
    return this.prisma.loginHistory.findMany({
      where: {
        organizationId: orgId,
        ...(userId ? { userId } : {}),
      },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(500, Math.max(1, limit)),
    });
  }
}
