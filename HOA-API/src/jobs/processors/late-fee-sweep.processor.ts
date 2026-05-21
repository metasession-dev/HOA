import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { LateFeesService } from '../../billing/late-fees.service';
import { QUEUE_NAMES } from '../queue-names';

@Processor(QUEUE_NAMES.LATE_FEE_SWEEP)
export class LateFeeSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(LateFeeSweepProcessor.name);

  constructor(private prisma: PrismaService, private lateFees: LateFeesService) {
    super();
  }

  async process(job: Job<{ organizationId?: string; triggeredBy?: string }>) {
    const { organizationId, triggeredBy } = job.data || {};

    if (organizationId) {
      const actor = await this.resolveActor(organizationId, triggeredBy);
      return this.lateFees.sweep(organizationId, actor);
    }

    // Cron sweep — every org with an active config.
    const orgs = await this.prisma.organization.findMany({
      where: { lateFeeConfig: { is: { isActive: true } } },
      select: { id: true },
    });
    let totalApplied = 0;
    let totalSkipped = 0;
    for (const org of orgs) {
      try {
        const actor = await this.resolveActor(org.id, triggeredBy);
        const r = await this.lateFees.sweep(org.id, actor);
        totalApplied += r.applied;
        totalSkipped += r.skipped;
      } catch (err: any) {
        this.logger.warn(`sweep ${org.id} failed: ${err.message}`);
      }
    }
    return { orgs: orgs.length, totalApplied, totalSkipped };
  }

  private async resolveActor(orgId: string, triggeredBy?: string) {
    if (triggeredBy) return { userId: triggeredBy, role: 'super_admin' };
    const adminRole = await this.prisma.userRole.findFirst({
      where: { organizationId: orgId, role: { name: { in: ['hoa_admin', 'super_admin'] } } },
      select: { userId: true },
    });
    if (adminRole) return { userId: adminRole.userId, role: 'super_admin' };
    const any = await this.prisma.user.findFirst({ select: { id: true } });
    if (!any) throw new Error('No users in DB — cannot attribute system job');
    return { userId: any.id, role: 'super_admin' };
  }
}
