import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Deny-by-default lockdown for narrowly-scoped roles.
 *
 * `gate_security` must only ever touch gate-pass / visitor-log endpoints, plus
 * the minimal shell every authenticated session needs (login, own profile,
 * notifications, org branding, the gate dashboard widget). Every other endpoint
 * — invoices, requests, units, people, finance, etc. — is 403 for them.
 *
 * This is the authoritative fix for the data-leak class where a non-resident
 * role hits resident-facing endpoints whose scope helpers don't narrow for
 * non-residents. It runs regardless of which portal the JWT came from, so it
 * holds even if a token is handed off between apps.
 *
 * Admins (super_admin / hoa_admin) and all other roles are unaffected.
 */

// Path prefixes (after the global `/api`) a gate_security user MAY reach.
const GATE_SECURITY_ALLOW = [
  '/auth',
  '/me',
  '/notifications',
  '/passes',
  '/visitor-logs',
  '/dashboard',
  '/organizations/current',
  '/health',
];

function extractReq(context: ExecutionContext): any {
  if (context.getType<string>() === 'graphql') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GqlExecutionContext } = require('@nestjs/graphql');
      return GqlExecutionContext.create(context).getContext().req;
    } catch {
      /* fall through */
    }
  }
  return context.switchToHttp().getRequest();
}

/** Strip the global `/api` prefix and any querystring, returning the route path. */
function normalizePath(req: any): string {
  let p: string = req?.path || req?.url || '';
  const q = p.indexOf('?');
  if (q !== -1) p = p.slice(0, q);
  if (p.startsWith('/api/')) p = p.slice(4);
  else if (p === '/api') p = '/';
  return p || '/';
}

@Injectable()
export class RestrictedRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = extractReq(context) || {};
    const role = req.user?.role;
    if (role !== 'gate_security') return true; // only restricts gate_security

    const path = normalizePath(req);
    const allowed = GATE_SECURITY_ALLOW.some(
      (prefix) => path === prefix || path.startsWith(prefix + '/'),
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Your role is limited to gate passes. This area is not available to you.',
      );
    }
    return true;
  }
}
