import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, PUBLIC_KEY, ONLY_EXACT_ROLES_KEY, PERMISSIONS_KEY } from '../../common/decorators';

/** Phase 9.1: support both HTTP and GraphQL contexts when extracting req. */
function extractReq(context: ExecutionContext): any {
  if (context.getType<string>() === 'graphql') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GqlExecutionContext } = require('@nestjs/graphql');
      return GqlExecutionContext.create(context).getContext().req;
    } catch { /* fall through */ }
  }
  return context.switchToHttp().getRequest();
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = extractReq(context) || {};
    const user = req.user;

    // Phase 9.2 review #1: API-key callers must always be scoped by an
    // explicit @RequirePermissions(...) check. If an endpoint opts an API
    // key in via @Roles('api_key', ...) but has no permissions check, the
    // key's permissions[] becomes decorative — a key with ['invoices.read']
    // would be indistinguishable from ['*']. Fail closed.
    if (user?.role === 'api_key') {
      const hasPermissionsCheck = !!this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      const allowsApiKey = Array.isArray(requiredRoles) && requiredRoles.includes('api_key');
      if (!allowsApiKey) return false;
      if (!hasPermissionsCheck) {
        throw new ForbiddenException(
          'API key callers may only hit endpoints that declare @RequirePermissions(...).',
        );
      }
      // The PermissionsGuard will enforce the actual permission set.
      return true;
    }

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const onlyExact = this.reflector.getAllAndOverride<boolean>(ONLY_EXACT_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!user) return false;

    // Phase 6: `@OnlyExactRoles()` disables admin auto-elevation. Used when an
    // endpoint is *only* meant for a specific persona (e.g. resident-only).
    if (!onlyExact && (user.role === 'super_admin' || user.role === 'hoa_admin')) return true;

    return requiredRoles.includes(user.role);
  }
}
