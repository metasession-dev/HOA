import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OrganizationsService } from '../../organizations/organizations.service';
import { QUEUE_NAMES } from '../queue-names';

/**
 * Daily sweep that sends a one-time "finish setting up" nudge to orgs that
 * registered a few days ago but haven't completed onboarding.
 */
@Processor(QUEUE_NAMES.ONBOARDING_NUDGE)
export class OnboardingNudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(OnboardingNudgeProcessor.name);

  constructor(private orgs: OrganizationsService) {
    super();
  }

  async process(_job: Job) {
    const r = await this.orgs.sendOnboardingNudges();
    this.logger.log(`onboarding nudge sweep — evaluated ${r.evaluated}, nudged ${r.nudged}`);
    return r;
  }
}
