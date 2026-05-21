import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private service: AuditService) {}

  @Get()
  @Roles('hoa_admin', 'exco_member')
  async findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('entityType') entityType?: string,
  ) {
    const p = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    const l = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 50;
    return this.service.findAll(orgId, p, l, entityType);
  }

  /**
   * Phase 6: walk the hash chain and report any tampering. Admin/exco-only.
   */
  @Get('verify-chain')
  @Roles('hoa_admin', 'exco_member', 'exco_chairperson')
  async verifyChain(
    @CurrentUser('organizationId') orgId: string,
    @Query('since') since?: string,
  ) {
    return successResponse(await this.service.verifyChain(orgId, since));
  }
}
