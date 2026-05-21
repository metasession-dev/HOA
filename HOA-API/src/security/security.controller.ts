import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { MfaService } from './mfa.service';
import { SessionsService } from './sessions.service';
import { MagicLinksService } from './magic-links.service';
import { AuthService } from '../auth/auth.service';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { successResponse } from '../common/dto';
import {
  StartMfaEnrollmentDto,
  VerifyMfaEnrollmentDto,
  DisableMfaDto,
  VerifyMfaLoginDto,
  RefreshTokenDto,
  RequestMagicLinkDto,
  RedeemMagicLinkDto,
  RevokeSessionDto,
  UpdateSecurityPolicyDto,
} from './dto/security.dto';
import { PrismaService } from '../common/prisma.service';

function ctxFrom(req: Request) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;
  return { ip, userAgent: req.headers['user-agent'] };
}

@ApiTags('Security')
@Controller('security')
export class SecurityController {
  constructor(
    private mfa: MfaService,
    private sessions: SessionsService,
    private magicLinks: MagicLinksService,
    private auth: AuthService,
    private prisma: PrismaService,
  ) {}

  // ============== MFA ==============

  @ApiBearerAuth()
  @Get('mfa/status')
  async mfaStatus(@CurrentUser('sub') userId: string) {
    return successResponse(await this.mfa.status(userId));
  }

  @ApiBearerAuth()
  @Post('mfa/enroll/start')
  async startEnrollment(
    @CurrentUser('sub') userId: string,
    @Body() _dto: StartMfaEnrollmentDto,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { userRoles: { include: { organization: { select: { name: true } } } } },
    });
    const orgName = user.userRoles[0]?.organization?.name;
    return successResponse(await this.mfa.startEnrollment(userId, user.email, orgName));
  }

  @ApiBearerAuth()
  @Post('mfa/enroll/verify')
  async verifyEnrollment(
    @CurrentUser('sub') userId: string,
    @Body() dto: VerifyMfaEnrollmentDto,
  ) {
    return successResponse(await this.mfa.verifyEnrollment(userId, dto.code));
  }

  @ApiBearerAuth()
  @Post('mfa/disable')
  async disableMfa(
    @CurrentUser('sub') userId: string,
    @Body() dto: DisableMfaDto,
  ) {
    return successResponse(await this.mfa.disable(userId, dto.password, dto.mfaCode));
  }

  @ApiBearerAuth()
  @Post('mfa/recovery-codes/regenerate')
  async regenerateRecovery(@CurrentUser('sub') userId: string) {
    return successResponse(await this.mfa.regenerateRecoveryCodes(userId));
  }

  // ============== MFA login challenge (public — caller is mid-login) ==============

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 }, medium: { limit: 20, ttl: 5 * 60_000 } })
  @Post('mfa/verify')
  async mfaVerifyLogin(@Body() dto: VerifyMfaLoginDto, @Req() req: Request) {
    // Phase 6 review #7: do not consume the challenge until the code is valid.
    // On bad code, record a failure (challenge burns after MFA_MAX_ATTEMPTS),
    // and report how many attempts remain so the client can show a meaningful
    // error instead of forcing the user back to the password screen.
    const peek = AuthService.peekMfaChallenge(dto.mfaChallengeToken);
    if (!peek) throw new UnauthorizedException('MFA challenge expired or invalid');
    const method = await this.mfa.verifyCodeForLogin(peek.userId, dto.code);
    if (!method) {
      const r = AuthService.recordMfaFailure(dto.mfaChallengeToken);
      throw new UnauthorizedException(
        r.burned
          ? 'Too many invalid MFA attempts — sign in again.'
          : `Invalid MFA code. ${r.attemptsLeft} attempt(s) remaining.`,
      );
    }
    const userId = AuthService.consumeMfaChallenge(dto.mfaChallengeToken)!;

    const ctx = ctxFrom(req);
    const completed = await this.auth.completeSessionForUser(userId, ctx);
    const sessionPair = await this.sessions.issue({
      userId,
      primaryRoleName: completed.primaryRole.name,
      primaryOrganizationId: completed.primaryRole.organizationId,
      ctx,
      markTrustedDevice: dto.trustDevice ? { label: dto.deviceLabel || 'Browser' } : undefined,
    });

    return successResponse({
      accessToken: sessionPair.accessToken,
      refreshToken: sessionPair.refreshToken,
      expiresIn: sessionPair.expiresIn,
      sessionId: sessionPair.sessionId,
      trustedDeviceToken: sessionPair.trustedDeviceToken,
      user: completed.user,
      mfaMethod: method,
    });
  }

  // ============== Refresh token rotation ==============

  @Public()
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ctx = ctxFrom(req);
    const r = await this.sessions.refresh(dto.refreshToken, ctx);
    return successResponse(r);
  }

  // ============== Sessions + trusted devices (authenticated) ==============

  @ApiBearerAuth()
  @Get('sessions')
  async listSessions(@CurrentUser('sub') userId: string) {
    return successResponse(await this.sessions.listSessions(userId));
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  async revokeSession(
    @Param('id') id: string,
    @Body() dto: RevokeSessionDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.sessions.revokeSession(id, { userId, role }, dto.reason));
  }

  @ApiBearerAuth()
  @Post('sessions/force-logout-self')
  async forceLogoutSelf(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.sessions.forceLogoutAll(userId, { userId, role }, 'user_force_logout'));
  }

  @ApiBearerAuth()
  @Roles('hoa_admin', 'super_admin')
  @Post('sessions/users/:targetUserId/force-logout')
  async forceLogoutUser(
    @Param('targetUserId') targetUserId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.sessions.forceLogoutAll(targetUserId, { userId, role }, 'admin_force_logout'));
  }

  @ApiBearerAuth()
  @Get('trusted-devices')
  async listDevices(@CurrentUser('sub') userId: string) {
    return successResponse(await this.sessions.listTrustedDevices(userId));
  }

  @ApiBearerAuth()
  @Delete('trusted-devices/:id')
  async revokeDevice(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.sessions.revokeTrustedDevice(id, { userId, role }));
  }

  // ============== Magic links (public) ==============

  @Public()
  @Throttle({ short: { limit: 3, ttl: 60_000 }, medium: { limit: 10, ttl: 60 * 60_000 } })
  @Post('magic-link/request')
  async magicLinkRequest(@Body() dto: RequestMagicLinkDto, @Req() req: Request) {
    const ctx = ctxFrom(req);
    return successResponse(await this.magicLinks.request(dto.email, ctx));
  }

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 }, medium: { limit: 30, ttl: 60 * 60_000 } })
  @Post('magic-link/redeem')
  async magicLinkRedeem(@Body() dto: RedeemMagicLinkDto, @Req() req: Request) {
    const { userId } = await this.magicLinks.redeem(dto.token);

    // Phase 6 review #9: magic-link must still respect MFA. If the user has
    // TOTP enabled OR their role mandates MFA, issue an MFA challenge instead
    // of a full session — anyone who controls the inbox would otherwise bypass
    // the second factor.
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    const activeRoles = user.userRoles.filter((r) => !r.expiresAt || r.expiresAt > new Date());
    const mfaRequired = await this.auth.mfaRequiredForUser(userId, activeRoles);
    if (user.totpEnabled || mfaRequired) {
      const mfaChallengeToken = AuthService.issueMfaChallenge(userId);
      return successResponse({
        mfaRequired: true,
        mfaChallengeToken,
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      });
    }

    const ctx = ctxFrom(req);
    const completed = await this.auth.completeSessionForUser(userId, ctx);
    const sessionPair = await this.sessions.issue({
      userId,
      primaryRoleName: completed.primaryRole.name,
      primaryOrganizationId: completed.primaryRole.organizationId,
      ctx,
      markTrustedDevice: dto.trustDevice ? { label: dto.deviceLabel || 'Browser' } : undefined,
    });
    return successResponse({
      accessToken: sessionPair.accessToken,
      refreshToken: sessionPair.refreshToken,
      expiresIn: sessionPair.expiresIn,
      sessionId: sessionPair.sessionId,
      trustedDeviceToken: sessionPair.trustedDeviceToken,
      user: completed.user,
    });
  }

  // ============== Org-level security policy (admin) ==============

  @ApiBearerAuth()
  @Roles('hoa_admin', 'super_admin')
  @Get('policy')
  async getPolicy(@CurrentUser('organizationId') orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { mfaRequiredRoles: true, ipAllowlist: true },
    });
    return successResponse(org);
  }

  @ApiBearerAuth()
  @Roles('hoa_admin', 'super_admin')
  @Post('policy')
  async updatePolicy(
    @Body() dto: UpdateSecurityPolicyDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // Validate CIDR shapes (basic): allow IPv4/IPv6 + optional /N. We don't
    // parse fully here — the request guard does that at enforcement time.
    if (dto.ipAllowlist) {
      for (const e of dto.ipAllowlist) {
        if (e.length > 64 || !/^[0-9a-fA-F:.\/]+$/.test(e)) {
          throw new BadRequestException(`Invalid CIDR: ${e}`);
        }
      }
    }
    const existing = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.organization.update({
        where: { id: orgId },
        data: {
          mfaRequiredRoles: dto.mfaRequiredRoles,
          ipAllowlist: dto.ipAllowlist,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: userId,
          actorRole: role,
          action: 'security_policy_updated',
          entityType: 'Organization',
          entityId: orgId,
          changes: {
            before: { mfaRequiredRoles: existing.mfaRequiredRoles, ipAllowlist: existing.ipAllowlist },
            after: { mfaRequiredRoles: o.mfaRequiredRoles, ipAllowlist: o.ipAllowlist },
          } as any,
        },
      });
      return o;
    });
    return successResponse(updated);
  }
}
