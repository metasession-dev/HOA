import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { successResponse } from '../common/dto';
import { BookkeepingService } from './bookkeeping.service';
import {
  AddNoteDto,
  AssignAccountantDto,
  CancelEngagementDto,
  ChangeTierDto,
  RequestEngagementDto,
} from './dto/bookkeeping.dto';
import { listTiers } from './tiers';

@ApiTags('Bookkeeping')
@ApiBearerAuth()
@Controller('bookkeeping')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookkeepingController {
  constructor(private readonly service: BookkeepingService) {}

  /** Tier catalogue — public so marketing/onboarding pages can render it. */
  @Public()
  @Get('tiers')
  tiers() {
    return successResponse(listTiers());
  }

  /** Current org's engagement (or null). Visible to anyone authed in the org. */
  @Get('engagement')
  async current(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.getForOrg(orgId));
  }

  /** Engagement detail with audit events. */
  @Get('engagement/:id')
  async get(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.getById(id, orgId));
  }

  /** Request the add-on. HOA admins only — financial commitment. */
  @Post('engagement')
  @Roles('hoa_admin')
  async request(
    @Body() dto: RequestEngagementDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return successResponse(
      await this.service.request({ organizationId: orgId, tier: dto.tier, notes: dto.notes, requestedBy: userId }),
    );
  }

  /** Activate after vetting. Platform-side (super_admin) action. */
  @Post('engagement/:id/activate')
  @Roles('super_admin')
  async activate(
    @Param('id') id: string,
    @Body() body: { accountantUserId?: string },
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return successResponse(
      await this.service.activate({ id, organizationId: orgId, actorId, accountantUserId: body?.accountantUserId }),
    );
  }

  /** Re-assign the dedicated accountant. */
  @Post('engagement/:id/assign-accountant')
  @Roles('super_admin', 'hoa_admin')
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignAccountantDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return successResponse(
      await this.service.assignAccountant({ id, organizationId: orgId, actorId, accountantUserId: dto.accountantUserId }),
    );
  }

  /** Upgrade / downgrade tier. New monthly fee applies from the next cycle. */
  @Put('engagement/:id/tier')
  @Roles('hoa_admin', 'super_admin')
  async changeTier(
    @Param('id') id: string,
    @Body() dto: ChangeTierDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return successResponse(
      await this.service.changeTier({ id, organizationId: orgId, actorId, tier: dto.tier }),
    );
  }

  @Post('engagement/:id/pause')
  @Roles('hoa_admin', 'super_admin')
  async pause(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return successResponse(await this.service.pause({ id, organizationId: orgId, actorId }));
  }

  @Post('engagement/:id/resume')
  @Roles('hoa_admin', 'super_admin')
  async resume(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return successResponse(await this.service.resume({ id, organizationId: orgId, actorId }));
  }

  @Post('engagement/:id/cancel')
  @Roles('hoa_admin', 'super_admin')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelEngagementDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return successResponse(await this.service.cancel({ id, organizationId: orgId, actorId, reason: dto.reason }));
  }

  @Post('engagement/:id/notes')
  @Roles('hoa_admin', 'super_admin', 'external_accountant')
  async note(
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return successResponse(await this.service.addNote({ id, organizationId: orgId, actorId, note: dto.note }));
  }
}
