import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from '../../mail/mail.service';
import { QUEUE_NAMES } from '../queue-names';

@Processor(QUEUE_NAMES.EMAIL_DELIVERIES)
export class EmailDeliveriesProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailDeliveriesProcessor.name);

  constructor(private mail: MailService) {
    super();
  }

  async process(job: Job<{ deliveryId?: string }>): Promise<{ ok: boolean; processed?: number; sent?: number; failed?: number; reason?: string }> {
    if (job.data?.deliveryId) {
      return this.mail.deliver(job.data.deliveryId);
    }
    // Cron sweep — drain every due pending row.
    const r = await this.mail.deliverPending(100);
    return { ok: true, ...r };
  }
}
