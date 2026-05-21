import { Module, Global, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { RecurringInvoicesProcessor } from './processors/recurring-invoices.processor';
import { LateFeeSweepProcessor } from './processors/late-fee-sweep.processor';
import { PaymentPlanInstallmentsProcessor } from './processors/payment-plan-installments.processor';
import { WebhookDeliveriesProcessor } from './processors/webhook-deliveries.processor';
import { EmailDeliveriesProcessor } from './processors/email-deliveries.processor';
import { QUEUE_NAMES } from './queue-names';
import { BillingModule } from '../billing/billing.module';
import { PrismaService } from '../common/prisma.service';

/**
 * Phase 2.1 worker infrastructure.
 *
 * Single in-process worker model: this same NestJS app dequeues jobs in
 * addition to serving HTTP. When the platform splits into a dedicated
 * `worker-jobs` Railway service, only `JobsModule` ships there with all
 * controllers removed; the queue producers stay in the API service.
 *
 * Disabling: set `JOBS_DISABLED=1` to skip BullModule wiring entirely — used
 * by smoke + CI environments that don't have Redis available.
 */
@Global()
@Module({})
export class JobsModule {
  static register() {
    const jobsDisabled = process.env.JOBS_DISABLED === '1';

    const imports = jobsDisabled
      ? []
      : [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
              const url = config.get<string>('REDIS_URL') || 'redis://localhost:6379';
              const parsed = new URL(url);
              return {
                connection: {
                  host: parsed.hostname,
                  port: Number(parsed.port) || 6379,
                  password: parsed.password || undefined,
                  // Keep the connection alive across queue + worker shutdowns.
                  maxRetriesPerRequest: null,
                  enableReadyCheck: false,
                },
              };
            },
          }),
          ...Object.values(QUEUE_NAMES).map((name) => BullModule.registerQueue({ name })),
          BillingModule,
        ];

    const providers = jobsDisabled
      ? [JobsService, PrismaService]
      : [
          JobsService, PrismaService,
          RecurringInvoicesProcessor,
          LateFeeSweepProcessor,
          PaymentPlanInstallmentsProcessor,
          WebhookDeliveriesProcessor,
          EmailDeliveriesProcessor,
        ];

    return {
      module: JobsModule,
      imports,
      controllers: [JobsController],
      providers,
      exports: [JobsService],
    };
  }
}
