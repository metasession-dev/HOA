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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TeamService } from './team.service';
import { InvitesService } from './invites.service';
import { CustomRolesService } from './custom-roles.service';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';
import {
  CreateInviteDto,
  BulkInviteDto,
  RedeemInviteDto,
  AssignRoleDto,
  UpdateUserRoleDto,
  CreateCustomRoleDto,
  UpdateCustomRoleDto,
} from './dto/team.dto';
import { permissionsByModule } from './permissions';
import { SystemRoles, RoleDisplayNames } from '../shared/constants/roles';
import { Permissions, RolePermissions } from '../shared/constants/permissions';

const ADMIN_ROLES = ['hoa_admin', 'super_admin'] as const;
const PM_ROLES = ['property_manager'] as const;

// Short, human descriptions of each built-in role for the roles & permissions
// page. System-role access is enforced by role (see RolesGuard), not by an
// editable permission set — these permission profiles are the documented intent.
const SYSTEM_ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: 'Platform root — unrestricted access across every organization.',
  hoa_admin: 'Full administrative access to this organization.',
  property_manager: 'Day-to-day estate & property operations with basic finance.',
  finance_officer: 'Invoicing, payments, GL, journals and reconciliation.',
  exco_member: 'Board member — read-mostly oversight of finance & governance.',
  exco_chairperson: 'Board chairperson — board oversight with chair privileges.',
  communications_manager: 'Sends and manages community broadcasts.',
  gate_security: 'Gate console — verify visitors and operate entry/exit.',
  maintenance_coordinator: 'Triages and coordinates maintenance requests.',
  external_accountant: 'Outside accountant — finance read & bookkeeping access.',
  owner: 'Resident owner — own invoices, payments, documents, visitor passes.',
  tenant: 'Resident tenant — own invoices, payments, documents, visitor passes.',
  vendor: 'External supplier — own vendor profile and invoices only.',
};

@ApiTags('Team')
@ApiBearerAuth()
@Controller('team')
@UseInterceptors(IdempotencyInterceptor)
export class TeamController {
  constructor(
    private team: TeamService,
    private invites: InvitesService,
    private customRoles: CustomRolesService,
  ) {}

  // ============== Users + role assignments ==============

  @Get('members')
  @Roles(...ADMIN_ROLES, ...PM_ROLES)
  async listMembers(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: { search?: string; includeResidents?: string; includeInactive?: string },
  ) {
    return successResponse(await this.team.list(orgId, query));
  }

  @Post('roles/assign')
  @Idempotent()
  @Roles(...ADMIN_ROLES)
  async assignRole(
    @Body() dto: AssignRoleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.team.assignRole(orgId, { userId, role }, dto));
  }

  @Put('user-roles/:id')
  @Roles(...ADMIN_ROLES)
  async updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.team.updateUserRole(id, orgId, { userId, role }, dto));
  }

  @Delete('user-roles/:id')
  @Roles(...ADMIN_ROLES)
  async revokeRole(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.team.revokeRole(id, orgId, { userId, role }));
  }

  @Post('users/:userId/deactivate')
  @Idempotent()
  @Roles(...ADMIN_ROLES)
  async deactivateUser(
    @Param('userId') targetUserId: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.team.deactivateUser(targetUserId, orgId, { userId, role }));
  }

  @Get('login-history')
  @Roles(...ADMIN_ROLES)
  async loginHistory(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: { userId?: string; limit?: string },
  ) {
    return successResponse(
      await this.team.loginHistory(orgId, query.userId, query.limit ? Number(query.limit) : 100),
    );
  }

  // ============== Invitations ==============

  @Get('invites')
  @Roles(...ADMIN_ROLES, ...PM_ROLES)
  async listInvites(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: { status?: string; search?: string; bulkImportId?: string; kind?: string },
  ) {
    return successResponse(await this.invites.list(orgId, query));
  }

  @Post('invites')
  @Idempotent()
  @Roles(...ADMIN_ROLES, ...PM_ROLES)
  async createInvite(
    @Body() dto: CreateInviteDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.invites.create(orgId, { userId, role }, dto));
  }

  @Post('invites/bulk')
  @Idempotent()
  @Roles(...ADMIN_ROLES)
  async bulkInvite(
    @Body() dto: BulkInviteDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.invites.bulkCreate(orgId, { userId, role }, dto));
  }

  @Post('invites/:id/revoke')
  @Idempotent()
  @Roles(...ADMIN_ROLES, ...PM_ROLES)
  async revokeInvite(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.invites.revoke(id, orgId, { userId, role }));
  }

  @Post('invites/:id/resend')
  @Idempotent()
  @Roles(...ADMIN_ROLES, ...PM_ROLES)
  async resendInvite(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.invites.resend(id, orgId, { userId, role }));
  }

  // ----- Public redeem endpoints (no auth) -----

  @Public()
  @Throttle({ short: { limit: 10, ttl: 60_000 }, medium: { limit: 60, ttl: 60 * 60_000 } })
  @Get('invites/public/:token')
  async lookupInvite(@Param('token') token: string) {
    return successResponse(await this.invites.lookupByToken(token));
  }

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 }, medium: { limit: 20, ttl: 60 * 60_000 } })
  @Post('invites/public/redeem')
  async redeemInvite(@Body() dto: RedeemInviteDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return successResponse(await this.invites.redeem(dto, { ip, userAgent }));
  }

  // ============== Custom roles ==============

  @Get('custom-roles')
  @Roles(...ADMIN_ROLES, ...PM_ROLES)
  async listCustomRoles(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.customRoles.list(orgId));
  }

  @Get('custom-roles/:id')
  @Roles(...ADMIN_ROLES, ...PM_ROLES)
  async findCustomRole(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.customRoles.findById(id, orgId));
  }

  @Post('custom-roles')
  @Roles(...ADMIN_ROLES)
  async createCustomRole(
    @Body() dto: CreateCustomRoleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.customRoles.create(orgId, { userId, role }, dto));
  }

  @Put('custom-roles/:id')
  @Roles(...ADMIN_ROLES)
  async updateCustomRole(
    @Param('id') id: string,
    @Body() dto: UpdateCustomRoleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.customRoles.update(id, orgId, { userId, role }, dto));
  }

  @Delete('custom-roles/:id')
  @Roles(...ADMIN_ROLES)
  async removeCustomRole(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.customRoles.remove(id, orgId, { userId, role }));
  }

  @Get('permissions')
  @Roles(...ADMIN_ROLES, ...PM_ROLES)
  async listPermissions() {
    return successResponse({ byModule: permissionsByModule() });
  }

  // Built-in system roles + their default permission profile. Read-only: system
  // roles can't be edited (access is enforced by role), but admins can see every
  // role and exactly what it's meant to do. Custom roles (above) remain editable.
  @Get('system-roles')
  @Roles(...ADMIN_ROLES, ...PM_ROLES)
  async listSystemRoles() {
    const allPermissionsCount = Object.values(Permissions).length;
    const roles = Object.values(SystemRoles).map((role) => {
      const permissions = RolePermissions[role] ?? [];
      return {
        role,
        displayName: RoleDisplayNames[role],
        description: SYSTEM_ROLE_DESCRIPTIONS[role] ?? '',
        isSystem: true,
        // hoa_admin / super_admin carry the full catalog.
        fullAccess: permissions.length === allPermissionsCount,
        permissions,
        permissionCount: permissions.length,
      };
    });
    return successResponse({ roles, allPermissionsCount });
  }

  // ============== Operations ==============

  @Post('expiry-sweep')
  @Idempotent()
  @Roles(...ADMIN_ROLES)
  async expirySweep(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.invites.runExpirySweep({ userId, role }));
  }
}
