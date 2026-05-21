import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
  HttpException, HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Phase 9.2 per-API-key rate limiter — in-memory token bucket, keyed by
 * apiKeyId. The default is 60 requests/min; per-key overrides come from
 * `req.user.apiKeyPermissions`-adjacent state set by the auth guard.
 *
 * In-memory means buckets reset on process restart and don't sync across
 * replicas. The Phase 9.3 / future-Redis migration swaps the Map for an
 * external store with the same interface. Until then, integrators on
 * single-replica deployments get correct enforcement; multi-replica
 * deployments get bucketing-per-instance which is fine for soft limits.
 *
 * @nestjs/throttler still runs as the per-IP global limiter, so an attacker
 * spraying many IPs is bounded at that layer too.
 */
const DEFAULT_LIMIT_PER_MIN = 60;
const WINDOW_MS = 60 * 1000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Periodically drop stale entries so the map doesn't grow unbounded.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt < now - WINDOW_MS) buckets.delete(k);
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
}

@Injectable()
export class ApiKeyRateLimitInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    ensureCleanup();
    let req: any = context.switchToHttp().getRequest();
    if (!req && context.getType<string>() === 'graphql') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { GqlExecutionContext } = require('@nestjs/graphql');
        req = GqlExecutionContext.create(context).getContext().req;
      } catch { /* fall through */ }
    }
    const user = req?.user;
    // Only apply to API-key callers; JWT users go through the normal throttler.
    if (!user || user.role !== 'api_key' || !user.apiKeyId) return next.handle();

    const limit = req?.apiKeyRateLimitPerMin || DEFAULT_LIMIT_PER_MIN;
    const now = Date.now();
    let bucket = buckets.get(user.apiKeyId);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      buckets.set(user.apiKeyId, bucket);
    }
    bucket.count += 1;
    const res = context.switchToHttp().getResponse();
    if (res?.setHeader) {
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    }
    if (bucket.count > limit) {
      throw new HttpException(
        {
          message: `API rate limit exceeded (${limit}/min). Resets at ${new Date(bucket.resetAt).toISOString()}.`,
          retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return next.handle();
  }
}
