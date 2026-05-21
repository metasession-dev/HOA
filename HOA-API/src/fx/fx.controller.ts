import {
  Controller, Get, Post, Body, Query, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FxService } from './fx.service';
import { UpsertManualRateDto, ConvertQueryDto, ListRatesQueryDto } from './dto/fx.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';

@ApiTags('FX')
@ApiBearerAuth()
@Controller('fx')
@UseInterceptors(IdempotencyInterceptor)
export class FxController {
  constructor(private fx: FxService) {}

  /** List rates the org can see (own + global), most recent first. */
  @Get('rates')
  async list(
    @CurrentUser('organizationId') orgId: string,
    @Query() q: ListRatesQueryDto,
  ) {
    return successResponse(await this.fx.list(orgId, q as any));
  }

  /** Manual rate entry (admins). Per-org row that wins over global on lookup. */
  @Post('rates')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  @Idempotent()
  async upsertManual(
    @Body() dto: UpsertManualRateDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.fx.upsertManualRate(orgId, { userId, role }, dto),
    );
  }

  /** Resolve a rate + convert a sample amount. */
  @Get('convert')
  async convert(
    @Query() q: ConvertQueryDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    const r = await this.fx.convert(
      Number(q.amount),
      q.from.toUpperCase(),
      q.to.toUpperCase(),
      q.asOf ? new Date(q.asOf) : new Date(),
      orgId,
    );
    return successResponse({
      amount: r.amount.toString(),
      rate: r.rate.toString(),
      asOfDate: r.asOfDate.toISOString().slice(0, 10),
      from: q.from.toUpperCase(),
      to: q.to.toUpperCase(),
      // Review #7: surface staleness so the UI can warn (e.g. "rate is 4 days old").
      source: r.source,
      ageDays: r.ageDays,
      isStale: r.isStale,
    });
  }

  /**
   * Trigger a daily OXR sync. No-ops when OXR_APP_ID is unset.
   * Review #8: throttled so an admin clicking the UI repeatedly can't burn
   * the OXR quota. Service-level dedup short-circuits when today's rates
   * already exist.
   */
  @Post('sync')
  @Roles('hoa_admin', 'super_admin')
  @Throttle({ short: { limit: 2, ttl: 60_000 }, medium: { limit: 10, ttl: 60 * 60_000 } })
  async sync(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.fx.syncDailyRates({ userId, role }));
  }
}
