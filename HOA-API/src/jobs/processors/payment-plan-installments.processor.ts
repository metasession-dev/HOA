import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { PaymentPlansService } from '../../billing/payment-plans.service';
import { QUEUE_NAMES } from '../queue-names';

@Processor(QUEUE_NAMES.PAYMENT_PLAN_INSTALLMENTS)
export class PaymentPlanInstallmentsProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentPlanInstallmentsProcessor.name);

  constructor(private prisma: PrismaService, private plans: PaymentPlansService) {
    super();
  }

  async process(job: Job<{ organizationId?: string; triggeredBy?: string }>) {
    const { organizationId, triggeredBy } = job.data || {};

    if (organizationId) {
      const actor = await this.resolveActor(organizationId, triggeredBy);
      return this.plans.materializeDueInstallments(organizationId, actor);
    }

    const orgs = await this.prisma.organization.findMany({
      where: { paymentPlans: { some: { status: 'active' } } },
      select: { id: true },
    });
    let totalGenerated = 0;
    for (const org of orgs) {
      try {
        const actor = await this.resolveActor(org.id, triggeredBy);
        const r = await this.plans.materializeDueInstallments(org.id, actor);
        totalGenerated += r.generated;
      } catch (err: any) {
        this.logger.warn(`materialize ${org.id} failed: ${err.message}`);
      }
    }
    return { orgs: orgs.length, totalGenerated };
  }

  private async resolveActor(orgId: string, triggeredBy?: string) {
    if (triggeredBy) return { userId: triggeredBy, role: 'super_admin' };
    const adminRole = await this.prisma.userRole.findFirst({
      where: { organizationId: orgId, role: { name: { in: ['hoa_admin', 'super_admin', 'finance_officer'] } } },
      select: { userId: true },
    });
    if (adminRole) return { userId: adminRole.userId, role: 'super_admin' };
    const any = await this.prisma.user.findFirst({ select: { id: true } });
    if (!any) throw new Error('No users in DB — cannot attribute system job');
    return { userId: any.id, role: 'super_admin' };
  }
}
