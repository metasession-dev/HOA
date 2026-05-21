import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics registry.
 *
 * One process-wide Registry, populated with:
 *   - Node default metrics (event loop lag, GC, memory, CPU)
 *   - HTTP request counter + duration histogram (populated by MetricsMiddleware)
 *   - Domain counters (push deliveries, webhook deliveries, payment intents,
 *     broadcasts sent) — call `inc()` from the relevant services as state
 *     transitions occur.
 *
 * The /metrics endpoint serves the textual exposition format.
 */
@Injectable()
export class MetricsService {
  readonly registry: Registry;

  readonly httpRequests: Counter<string>;
  readonly httpDuration: Histogram<string>;
  readonly httpInFlight: Gauge<string>;

  readonly pushDispatches: Counter<string>;
  readonly webhookDeliveries: Counter<string>;
  readonly paymentIntents: Counter<string>;
  readonly broadcastsSent: Counter<string>;

  constructor() {
    this.registry = new Registry();
    this.registry.setDefaultLabels({ app: 'hoa-api' });
    collectDefaultMetrics({ register: this.registry });

    this.httpRequests = new Counter({
      name: 'hoa_http_requests_total',
      help: 'HTTP requests processed.',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    this.httpDuration = new Histogram({
      name: 'hoa_http_request_duration_seconds',
      help: 'HTTP request latency in seconds.',
      labelNames: ['method', 'route', 'status'],
      // Buckets tuned for typical API latencies — 5ms..10s.
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.httpInFlight = new Gauge({
      name: 'hoa_http_in_flight_requests',
      help: 'Requests currently being processed.',
      registers: [this.registry],
    });

    this.pushDispatches = new Counter({
      name: 'hoa_push_dispatches_total',
      help: 'Web Push dispatch attempts.',
      labelNames: ['outcome'], // delivered | revoked | failed
      registers: [this.registry],
    });
    this.webhookDeliveries = new Counter({
      name: 'hoa_webhook_deliveries_total',
      help: 'Outbound webhook delivery attempts.',
      labelNames: ['outcome', 'event'], // success | failure
      registers: [this.registry],
    });
    this.paymentIntents = new Counter({
      name: 'hoa_payment_intents_total',
      help: 'Payment intent state transitions.',
      labelNames: ['from', 'to', 'method'],
      registers: [this.registry],
    });
    this.broadcastsSent = new Counter({
      name: 'hoa_broadcasts_sent_total',
      help: 'Broadcast deliveries by channel.',
      labelNames: ['channel', 'outcome'],
      registers: [this.registry],
    });
  }

  /** Render the Prometheus text exposition. */
  async render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
