import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Express middleware that times each request and labels by method + route +
 * status. We use `req.route?.path` once Nest has matched the handler so the
 * `route` label is bounded (otherwise `/api/invoices/cmpd...` would explode
 * cardinality). When unmatched (e.g. 404s before routing) we fall back to
 * the raw path with the org/cuid suffix trimmed.
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    this.metrics.httpInFlight.inc();
    res.on('finish', () => {
      const ns = Number(process.hrtime.bigint() - start);
      const seconds = ns / 1e9;
      const route = (req as any).route?.path || normalisePath(req.path);
      const labels = { method: req.method, route, status: String(res.statusCode) };
      this.metrics.httpInFlight.dec();
      this.metrics.httpRequests.inc(labels);
      this.metrics.httpDuration.observe(labels, seconds);
    });
    next();
  }
}

/**
 * Best-effort path bucketing for non-matched routes. Replaces obvious id
 * segments with placeholders. Not perfect (and not used once a Nest route
 * has matched), but bounds cardinality for stray traffic + 404s.
 */
function normalisePath(p: string): string {
  return p
    .replace(/\/cmp[a-z0-9]{20,}/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    .replace(/\/\d+/g, '/:n');
}
