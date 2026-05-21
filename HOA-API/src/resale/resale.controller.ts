import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseInterceptors,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { ResaleService } from './resale.service';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';
import {
  CreateResaleDto,
  UpdateResaleDto,
  CreateAccessLinkDto,
  CancelResaleDto,
} from './dto/resale.dto';

const ADMIN = ['hoa_admin', 'super_admin'] as const;
const PM = ['property_manager'] as const;

// In-memory rate limiter for public token endpoint. Phase 9 swap to Redis.
// Bounded by MAX_BUCKETS so unbounded token probing can't OOM the process.
const PUBLIC_RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();
const PUBLIC_RATE_LIMIT = 30;
const PUBLIC_WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

function evictIfFull() {
  if (PUBLIC_RATE_BUCKETS.size < MAX_BUCKETS) return;
  const now = Date.now();
  for (const [k, v] of PUBLIC_RATE_BUCKETS) {
    if (v.resetAt < now) PUBLIC_RATE_BUCKETS.delete(k);
  }
  if (PUBLIC_RATE_BUCKETS.size >= MAX_BUCKETS) {
    // Drop the oldest 10% in insertion order.
    const drop = Math.floor(MAX_BUCKETS * 0.1);
    let i = 0;
    for (const k of PUBLIC_RATE_BUCKETS.keys()) {
      if (i++ >= drop) break;
      PUBLIC_RATE_BUCKETS.delete(k);
    }
  }
}

@ApiTags('Resale')
@ApiBearerAuth()
@Controller('resale')
@UseInterceptors(IdempotencyInterceptor)
export class ResaleController {
  constructor(private service: ResaleService) {}

  @Get()
  @Roles(...ADMIN, ...PM)
  async list(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: { status?: string; unitId?: string; search?: string },
  ) {
    return successResponse(await this.service.list(orgId, query));
  }

  @Get(':id')
  @Roles(...ADMIN, ...PM)
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.service.findById(id, orgId));
  }

  @Post()
  @Roles(...ADMIN, ...PM)
  async create(
    @Body() dto: CreateResaleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.create(orgId, { userId, role }, dto));
  }

  @Put(':id')
  @Roles(...ADMIN, ...PM)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateResaleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.update(id, orgId, { userId, role }, dto));
  }

  @Post(':id/refresh-snapshot')
  @Idempotent()
  @Roles(...ADMIN, ...PM)
  async refresh(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.refreshSnapshot(id, orgId, { userId, role }));
  }

  @Post(':id/issue')
  @Idempotent()
  @Roles(...ADMIN, ...PM)
  async issue(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.issue(id, orgId, { userId, role }));
  }

  @Post(':id/cancel')
  @Idempotent()
  @Roles(...ADMIN)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelResaleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.cancel(id, orgId, { userId, role }, dto));
  }

  @Post(':id/access-links')
  @Idempotent()
  @Roles(...ADMIN, ...PM)
  async createLink(
    @Param('id') id: string,
    @Body() dto: CreateAccessLinkDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.createAccessLink(id, orgId, { userId, role }, dto));
  }

  @Delete('access-links/:linkId')
  @Roles(...ADMIN, ...PM)
  async revokeLink(
    @Param('linkId') linkId: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.revokeAccessLink(linkId, orgId, { userId, role }));
  }

  @Get('access-links/:linkId/audit')
  @Roles(...ADMIN, ...PM)
  async linkAudit(
    @Param('linkId') linkId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.service.accessLogs(linkId, orgId));
  }

  @Public()
  @Get('public/:token')
  async publicView(@Param('token') token: string, @Req() req: Request) {
    // Naive in-memory rate limit: 30 / min per token (Phase 9 swap to Redis)
    const now = Date.now();
    const bucket = PUBLIC_RATE_BUCKETS.get(token);
    if (!bucket || bucket.resetAt < now) {
      evictIfFull();
      PUBLIC_RATE_BUCKETS.set(token, { count: 1, resetAt: now + PUBLIC_WINDOW_MS });
    } else {
      bucket.count++;
      if (bucket.count > PUBLIC_RATE_LIMIT) {
        throw new HttpException(
          { message: 'Too many requests. Try again in a moment.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || undefined;
    const ua = req.headers['user-agent'];
    return successResponse(await this.service.publicView(token, ip, ua));
  }
}
