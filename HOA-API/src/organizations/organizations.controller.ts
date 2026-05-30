import { Controller, Get, Put, Body, Param, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrganizationsService } from './organizations.service';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { successResponse } from '../common/dto';

class UpdateOrganizationDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2) country?: string;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsString() @MaxLength(8) language?: string;
}

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private service: OrganizationsService) {}

  @Get('current')
  async getCurrent(@CurrentUser('organizationId') orgId: string) {
    const org = await this.service.findById(orgId);
    return successResponse(org);
  }

  @Put('current')
  @Roles('hoa_admin')
  async updateCurrent(
    @CurrentUser('organizationId') orgId: string,
    @Body() data: UpdateOrganizationDto,
  ) {
    const org = await this.service.update(orgId, data);
    return successResponse(org);
  }

  @Get('dashboard-stats')
  async getDashboardStats(@CurrentUser('organizationId') orgId: string) {
    const stats = await this.service.getDashboardStats(orgId);
    return successResponse(stats);
  }

  /** Onboarding checklist state for the "Getting started" card (admin console). */
  @Get('onboarding')
  async getOnboarding(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.getOnboarding(orgId));
  }

  /** Phase 10.2 — branding update (logo, accent colour, tagline). Admin-only. */
  @Put('current/branding')
  @Roles('hoa_admin')
  async updateBranding(
    @CurrentUser('organizationId') orgId: string,
    @Body() body: { logoUrl?: string | null; accentColor?: string | null; brandingTagline?: string | null },
  ) {
    try {
      const out = await this.service.updateBranding(orgId, body);
      return successResponse(out);
    } catch (err: any) {
      if (err?.message?.includes('accentColor')) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /**
   * Phase 10.2 — public branding lookup by slug. The resident login page hits
   * this *before* the user authenticates so the page can render the HOA's
   * logo + accent colour. Returns only the brand-safe fields.
   */
  // Public lookups are scrape magnets — cap per-IP so an attacker can't
  // enumerate every HOA slug or trigger heavy DB queries at line speed.
  // 30 req/min is well above any legitimate login-page load cadence.
  @Public()
  @Throttle({ short: { limit: 10, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } })
  @Get('by-slug/:slug/branding')
  async brandingBySlug(@Param('slug') slug: string) {
    const out = await this.service.getBrandingBySlug(slug);
    return successResponse(out);
  }
}
