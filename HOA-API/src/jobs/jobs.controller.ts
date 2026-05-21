import {
  Controller, Get, Post, Param, Body, BadRequestException, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { QUEUE_NAMES, QueueName } from './queue-names';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';

const ALLOWED: QueueName[] = Object.values(QUEUE_NAMES) as QueueName[];

function assertValidQueue(name: string): QueueName {
  if (!ALLOWED.includes(name as QueueName)) {
    throw new BadRequestException(`Unknown queue: ${name}`);
  }
  return name as QueueName;
}

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
@Roles('super_admin', 'hoa_admin')
export class JobsController {
  constructor(private jobs: JobsService) {}

  @Get()
  async list() {
    return successResponse(await this.jobs.getQueueStats());
  }

  @Get(':queue/failed')
  async failed(@Param('queue') queue: string, @Query('take') take: string | undefined) {
    return successResponse(await this.jobs.getFailedJobs(assertValidQueue(queue), Number(take) || 20));
  }

  @Post(':queue/failed/:jobId/retry')
  async retry(@Param('queue') queue: string, @Param('jobId') jobId: string) {
    return successResponse(await this.jobs.retryFailedJob(assertValidQueue(queue), jobId));
  }

  /**
   * One-shot manual trigger. Pass through the admin's userId so the spawned
   * AuditLog rows reflect who clicked "Run now", not the system actor.
   */
  @Post(':queue/run')
  async run(
    @Param('queue') queue: string,
    @Body() body: { organizationId?: string; scheduleId?: string } = {},
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') currentOrgId: string,
  ) {
    const data: any = { triggeredBy: userId };
    if (body.organizationId) data.organizationId = body.organizationId;
    else if (currentOrgId) data.organizationId = currentOrgId;
    if (body.scheduleId) data.scheduleId = body.scheduleId;
    return successResponse(await this.jobs.triggerOnce(assertValidQueue(queue), data));
  }
}
