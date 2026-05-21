import {
  Injectable, OnApplicationBootstrap, Optional, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QueueName, REPEAT_SCHEDULES, DEFAULT_JOB_OPTS } from './queue-names';

/**
 * JobsService = the producer side of every queue. Handlers (Processors) live
 * in their own files and only know how to consume.
 *
 * Resilience: every method here is a no-op when `JOBS_DISABLED=1` so tests +
 * smoke environments without Redis don't fail. In production, the constructor
 * will fail noisily if Redis is unreachable — that's the right behaviour.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);
  private readonly disabled = process.env.JOBS_DISABLED === '1';

  constructor(
    @Optional() @InjectQueue(QUEUE_NAMES.RECURRING_INVOICES) private recurringQ?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.LATE_FEE_SWEEP) private lateFeeQ?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.PAYMENT_PLAN_INSTALLMENTS) private planQ?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.WEBHOOK_DELIVERIES) private webhookQ?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.EMAIL_DELIVERIES) private emailQ?: Queue,
  ) {}

  async onApplicationBootstrap() {
    if (this.disabled) {
      this.logger.warn('Jobs module disabled (JOBS_DISABLED=1) — no schedules registered');
      return;
    }
    if (process.env.JOBS_AUTO_SCHEDULE === '0') {
      this.logger.warn('JOBS_AUTO_SCHEDULE=0 — skipping repeatable schedule registration');
      return;
    }
    // Register the repeatable schedules. BullMQ deduplicates by `jobId` so
    // restarting the app doesn't create overlapping repeats.
    for (const name of Object.values(QUEUE_NAMES) as QueueName[]) {
      const q = this.queueFor(name);
      if (!q) continue;
      const cfg = REPEAT_SCHEDULES[name];
      try {
        await q.add(
          'repeat',
          {},
          {
            jobId: `${name}-repeat`,
            repeat: cfg.pattern ? { pattern: cfg.pattern } : { every: cfg.every },
            ...DEFAULT_JOB_OPTS,
          },
        );
        this.logger.log(`Scheduled ${name}: ${cfg.description}`);
      } catch (err: any) {
        this.logger.error(`Failed to schedule ${name}: ${err.message}`);
      }
    }
  }

  /** Get aggregate queue stats for the admin observability page. */
  async getQueueStats() {
    if (this.disabled) {
      return Object.values(QUEUE_NAMES).map((name) => ({
        name, disabled: true, description: REPEAT_SCHEDULES[name as QueueName].description,
      }));
    }
    const out: any[] = [];
    for (const name of Object.values(QUEUE_NAMES) as QueueName[]) {
      const q = this.queueFor(name);
      if (!q) {
        out.push({ name, disabled: true });
        continue;
      }
      try {
        const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
        const repeatable = await q.getRepeatableJobs();
        out.push({
          name,
          description: REPEAT_SCHEDULES[name].description,
          counts,
          repeatableJobs: repeatable.map((r) => ({
            id: r.id, name: r.name, pattern: r.pattern, next: r.next ? new Date(r.next).toISOString() : null,
          })),
        });
      } catch (err: any) {
        out.push({ name, error: err.message });
      }
    }
    return out;
  }

  /** Failed-jobs detail for the dead-letter UI. */
  async getFailedJobs(name: QueueName, take = 20) {
    if (this.disabled) return [];
    const q = this.queueFor(name);
    if (!q) throw new NotFoundException(`Queue ${name} not found`);
    const jobs = await q.getFailed(0, Math.min(100, Math.max(1, take)) - 1);
    return jobs.map((j) => ({
      id: j.id, name: j.name, data: j.data,
      failedReason: j.failedReason,
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
      finishedOn: j.finishedOn,
      stacktrace: (j.stacktrace || []).slice(0, 1),
    }));
  }

  /** Retry a single dead-letter job. */
  async retryFailedJob(name: QueueName, jobId: string) {
    if (this.disabled) throw new BadRequestException('Jobs disabled');
    const q = this.queueFor(name);
    if (!q) throw new NotFoundException(`Queue ${name} not found`);
    const job = await q.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');
    await job.retry();
    return { ok: true };
  }

  /** One-shot trigger — kicks off a job now, outside the cron. Used by the admin "Run now" button. */
  async triggerOnce(name: QueueName, data: any = {}) {
    if (this.disabled) throw new BadRequestException('Jobs disabled');
    const q = this.queueFor(name);
    if (!q) throw new NotFoundException(`Queue ${name} not found`);
    const job = await q.add('manual', data, DEFAULT_JOB_OPTS);
    return { jobId: job.id };
  }

  private queueFor(name: QueueName): Queue | undefined {
    switch (name) {
      case QUEUE_NAMES.RECURRING_INVOICES: return this.recurringQ;
      case QUEUE_NAMES.LATE_FEE_SWEEP: return this.lateFeeQ;
      case QUEUE_NAMES.PAYMENT_PLAN_INSTALLMENTS: return this.planQ;
      case QUEUE_NAMES.WEBHOOK_DELIVERIES: return this.webhookQ;
      case QUEUE_NAMES.EMAIL_DELIVERIES: return this.emailQ;
    }
  }
}
