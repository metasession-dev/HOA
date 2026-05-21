import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable, firstValueFrom, isObservable } from 'rxjs';
import { PUBLIC_KEY } from '../../common/decorators';
import { ApiKeysService } from '../../platform/api-keys.service';

/**
 * Extract the underlying Express request from either an HTTP context or a
 * GraphQL context. GraphQL hands us a synthesised execution context whose
 * `switchToHttp()` returns an empty shim — we need to dig into the
 * GraphQLContext to find the real req.
 */
function extractRequest(context: ExecutionContext): any {
  if (context.getType<string>() === 'graphql') {
    // Lazy import — `@nestjs/graphql` isn't always installed.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GqlExecutionContext } = require('@nestjs/graphql');
      const gql = GqlExecutionContext.create(context);
      return gql.getContext().req;
    } catch {
      // Fall through to HTTP shim
    }
  }
  return context.switchToHttp().getRequest();
}

/**
 * Phase 9.2: this guard now accepts both JWT (Authorization: Bearer ...) and
 * platform API keys (X-API-Key: hoa_live_...). When an API key is present, we
 * validate it via ApiKeysService and populate req.user with a synthetic
 * principal that downstream guards (RolesGuard, PermissionsGuard) can read.
 *
 * The synthetic principal carries:
 *   - sub: `apikey_<keyId>` so audit logs identify the integration, not a human
 *   - role: 'api_key' (a pseudo-role; checked by RolesGuard via the keys' permissions[])
 *   - organizationId: the key's org
 *   - apiKeyId / apiKeyPermissions: surfaced for the PermissionsGuard
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector, private apiKeys: ApiKeysService) {
    super();
  }

  /**
   * Passport's strategy reads the request from `context.switchToHttp().getRequest()`.
   * For GraphQL we substitute the GraphQL-context's req so headers + user
   * survive the trip.
   */
  getRequest(context: ExecutionContext) {
    return extractRequest(context);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = extractRequest(context);
    if (!req || !req.headers) {
      // No request to authenticate against (e.g. introspection or a malformed
      // call). Let the underlying AuthGuard reject so the client gets a 401
      // rather than a silent pass.
      const result = super.canActivate(context);
      if (typeof result === 'boolean') return result;
      if (isObservable(result)) return firstValueFrom(result as Observable<boolean>);
      return result as Promise<boolean>;
    }
    const headerKey = (req.headers['x-api-key'] || req.headers['X-API-Key']) as string | undefined;
    if (headerKey) {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress;
      const key = await this.apiKeys.verify(headerKey, ip);
      if (!key) throw new UnauthorizedException('Invalid or revoked API key');
      // Synthesize a principal the rest of the stack can read.
      req.user = {
        sub: `apikey_${key.id}`,
        email: null,
        role: 'api_key',
        organizationId: key.organizationId,
        apiKeyId: key.id,
        apiKeyPermissions: key.permissions,
      };
      // Pipe the per-key rate limit through so the rate-limit interceptor
      // honors per-key overrides (default applies when null).
      if (key.rateLimitPerMin) req.apiKeyRateLimitPerMin = key.rateLimitPerMin;
      return true;
    }

    // Fall back to JWT. AuthGuard('jwt').canActivate may return boolean,
    // Promise<boolean>, or Observable<boolean> — normalise to a boolean.
    const result = super.canActivate(context);
    if (typeof result === 'boolean') return result;
    if (isObservable(result)) return firstValueFrom(result as Observable<boolean>);
    return result as Promise<boolean>;
  }
}
