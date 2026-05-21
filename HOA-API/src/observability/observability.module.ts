import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryService } from './sentry.service';
import { PostHogService } from './posthog.service';
import { MetricsService } from './metrics.service';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsController } from './metrics.controller';
import { SentryExceptionFilter } from './sentry.filter';

/**
 * Single module that wires Sentry + PostHog + Prometheus. @Global so domain
 * services (push, payments, broadcasts) can inject without per-module imports.
 *
 * All three subsystems no-op when their respective env vars are absent, so
 * the module loads cleanly in dev + test.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    SentryService,
    PostHogService,
    MetricsService,
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
  ],
  exports: [SentryService, PostHogService, MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
