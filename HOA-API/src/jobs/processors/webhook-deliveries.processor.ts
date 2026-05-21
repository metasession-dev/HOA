import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhooksService } from '../../platform/webhooks.service';
import { QUEUE_NAMES } from '../queue-names';

/**
 * Drains the pending WebhookDelivery rows on a 60-second cron. Each tick takes
 * up to 100 rows so a backlog doesn't get stuck — BullMQ also retries the job
 * itself if the call throws, but the inner `deliverPending` already swallows
 * per-row errors so the job-level retry path is reserved for Redis flakes.
 */
@Processor(QUEUE_NAMES.WEBHOOK_DELIVERIES)
export class WebhookDeliveriesProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveriesProcessor.name);

  constructor(private webhooks: WebhooksService) {
    super();
  }

  async process(_job: Job): Promise<{ processed: number }> {
    return this.webhooks.deliverPending(100);
  }
}
