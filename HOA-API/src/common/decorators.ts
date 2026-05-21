import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    // Phase 9.1: also support GraphQL contexts.
    let request: any = ctx.switchToHttp().getRequest();
    if ((!request || !request.user) && ctx.getType<string>() === 'graphql') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { GqlExecutionContext } = require('@nestjs/graphql');
        request = GqlExecutionContext.create(ctx).getContext().req;
      } catch { /* no-op */ }
    }
    const user = request?.user;
    return data ? user?.[data] : user;
  },
);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Phase 6: declare an endpoint requires roles EXACTLY — disables the
 * RolesGuard's implicit auto-elevation for hoa_admin/super_admin. Use for
 * "act as exactly this persona" endpoints (e.g. resident-only acknowledge
 * flows, gate-only entry endpoints).
 */
export const ONLY_EXACT_ROLES_KEY = 'onlyExactRoles';
export const OnlyExactRoles = () => SetMetadata(ONLY_EXACT_ROLES_KEY, true);
