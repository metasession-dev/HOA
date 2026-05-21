import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PUBLIC_KEY } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';

/**
 * Permission-based authorization. Endpoints opt in with `@RequirePermissions(...)`.
 *
 * Resolution order:
 *   1. If `@Public()` → allow.
 *   2. If no @RequirePermissions → defer to RolesGuard (this guard is a no-op).
 *   3. If actor's role is `hoa_admin` or `super_admin` → allow (admins hold
 *      everything implicitly, mirroring RolesGuard behavior).
 *   4. Otherwise: look up the user's CustomRole assignments in the actor's org
 *      and compute the union of permissions. The required set must be a subset.
 *
 * This guard is additive: endpoints without `@RequirePermissions` still use
 * the existing `@Roles` flow. New, fine-grained endpoints can opt in.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    // Phase 9.1: extract from GraphQL context when applicable.
    let req: any = context.switchToHttp().getRequest();
    if (!req && context.getType<string>() === 'graphql') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { GqlExecutionContext } = require('@nestjs/graphql');
        req = GqlExecutionContext.create(context).getContext().req;
      } catch { /* fall through */ }
    }
    const user = req?.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    // Phase 9.2: API-key principals carry their permission set on the
    // request itself — no DB lookup. `*` is a full-access shortcut.
    if (user.role === 'api_key' && Array.isArray(user.apiKeyPermissions)) {
      const granted = new Set<string>(user.apiKeyPermissions);
      if (granted.has('*')) return true;
      const missing = required.filter((p) => !granted.has(p));
      if (missing.length > 0) {
        throw new ForbiddenException(`API key missing permissions: ${missing.join(', ')}`);
      }
      return true;
    }

    // Phase 6 review #5: do NOT auto-elevate admins here. PermissionsGuard
    // exists for separation-of-duty controls (auditor vs admin, finance
    // officer vs CEO). System admins must have permissions assigned
    // explicitly via their Role.permissions (wildcard "*" supported below)
    // or via a CustomRole. RolesGuard still elevates admins for plain
    // @Roles() checks; PermissionsGuard checks the granted set explicitly.

    const assignments = await this.prisma.userRole.findMany({
      where: {
        userId: user.sub,
        organizationId: user.organizationId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        customRole: { select: { permissions: true, isActive: true } },
        role: { select: { permissions: true } },
      },
    });
    const granted = new Set<string>();
    let hasWildcard = false;
    for (const a of assignments) {
      if (a.customRole && a.customRole.isActive) {
        for (const p of a.customRole.permissions) granted.add(p);
      }
      // Role.permissions[] is the seeded system-role permission set; "*"
      // grants everything (used for hoa_admin/super_admin during register).
      for (const p of a.role.permissions ?? []) {
        if (p === '*') hasWildcard = true;
        granted.add(p);
      }
    }
    if (hasWildcard) return true;
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permissions: ${missing.join(', ')}`);
    }
    return true;
  }
}
