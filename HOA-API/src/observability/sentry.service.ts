import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/node';

/**
 * Sentry initialisation + thin wrapper.
 *
 * Disabled by default — set SENTRY_DSN in env to turn it on. We only capture
 * server-side errors here; the frontends initialise Sentry independently so
 * the browser stack traces stay in the same project.
 *
 * Tracing sample rate defaults to 10% to avoid surprise costs; bump via
 * SENTRY_TRACES_SAMPLE_RATE in production after dashboards exist.
 */
@Injectable()
export class SentryService implements OnModuleInit {
  private readonly logger = new Logger(SentryService.name);
  private enabled = false;

  onModuleInit() {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
      this.logger.log('Sentry disabled (no SENTRY_DSN).');
      return;
    }
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || process.env.GIT_SHA,
      // We attach error fingerprints + user context in the exception filter,
      // not in `beforeSend`, so the sampler can still drop noisy errors here.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      // Scrub headers that may contain bearer tokens or API keys.
      sendDefaultPii: false,
    });
    this.enabled = true;
    this.logger.log(`Sentry initialised (env=${process.env.NODE_ENV || 'development'}).`);
  }

  /** Capture a non-fatal exception with optional structured context. */
  captureException(err: unknown, context?: { userId?: string; organizationId?: string; tags?: Record<string, string>; extra?: Record<string, unknown> }) {
    if (!this.enabled) return;
    Sentry.withScope((scope) => {
      if (context?.userId) scope.setUser({ id: context.userId });
      if (context?.organizationId) scope.setTag('organizationId', context.organizationId);
      if (context?.tags) for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
      if (context?.extra) for (const [k, v] of Object.entries(context.extra)) scope.setExtra(k, v);
      Sentry.captureException(err);
    });
  }

  /** Lower-priority log breadcrumb / message (not an exception). */
  captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
    if (!this.enabled) return;
    Sentry.captureMessage(message, level);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Allow shutdown to flush in-flight events. */
  async flush(timeoutMs = 2000): Promise<boolean> {
    if (!this.enabled) return true;
    return Sentry.flush(timeoutMs);
  }
}
