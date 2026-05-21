import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { RecurringInvoicesService } from '../../billing/recurring.service';
import { QUEUE_NAMES } from '../queue-names';

/**
 * Recurring invoice generation worker.
 *
 * Job shapes:
 *   - `{ }` (manual sweep): walk every org with active schedules due, run each.
 *   - `{ organizationId }`: scoped sweep for that org only.
 *   - `{ organizationId, scheduleId }`: run exactly one schedule.
 *
 * Actor: system. We attribute jobs to a synthetic system user — there must
 * always be a real user to satisfy the AuditLog FK. The CLI / one-off flow
 * carries the triggering admin's userId on `data.triggeredBy`.
 */
@Processor(QUEUE_NAMES.RECURRING_INVOICES)
export class RecurringInvoicesProcessor extends WorkerHost {
  private readonly logger = new Logger(RecurringInvoicesProcessor.name);

  constructor(private prisma: PrismaService, private recurring: RecurringInvoicesService) {
    super();
  }

  async process(job: Job<{ organizationId?: string; scheduleId?: string; triggeredBy?: string }>) {
    const { organizationId, scheduleId, triggeredBy } = job.data || {};
    const actor = await this.resolveActor(organizationId, triggeredBy);

    if (scheduleId && organizationId) {
      return this.recurring.run(organizationId, actor, scheduleId);
    }

    if (organizationId) {
      return this.recurring.runDueSchedules(organizationId, actor);
    }

    // Cron-driven sweep: walk every org with at least one active schedule.
    const orgs = await this.prisma.organization.findMany({
      where: { recurringSchedules: { some: { isActive: true } } },
      select: { id: true },
    });
    let totalProcessed = 0;
    for (const org of orgs) {
      try {
        const a = await this.resolveActor(org.id, triggeredBy);
        const r = await this.recurring.runDueSchedules(org.id, a);
        totalProcessed += r.processed;
      } catch (err: any) {
        this.logger.warn(`runDueSchedules ${org.id} failed: ${err.message}`);
      }
    }
    return { orgs: orgs.length, totalProcessed };
  }

  private async resolveActor(orgId: string | undefined, triggeredBy: string | undefined) {
    if (triggeredBy) {
      return { userId: triggeredBy, role: 'super_admin' };
    }
    // Pick the first hoa_admin in the org as the system actor so the audit
    // trail attributes the job to a real user. If no admin exists yet (brand
    // new org during seed), fall back to the org creator.
    if (orgId) {
      const adminRole = await this.prisma.userRole.findFirst({
        where: { organizationId: orgId, role: { name: { in: ['hoa_admin', 'super_admin'] } } },
        select: { userId: true },
      });
      if (adminRole) return { userId: adminRole.userId, role: 'super_admin' };
    }
    // Last resort — pick any user. Better than crashing.
    const any = await this.prisma.user.findFirst({ select: { id: true } });
    if (!any) throw new Error('No users in DB — cannot attribute system job');
    return { userId: any.id, role: 'super_admin' };
  }
}
