import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { sha256, randomToken } from '../common/encryption';

export type Actor = { userId: string; role: string };

export type RequestContext = {
  ip?: string;
  userAgent?: string;
  trustedDeviceToken?: string;
};

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;
const TRUSTED_DEVICE_TTL_DAYS = 60;

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Issue a fresh session for a user that has passed authentication
   * (password+MFA OR magic link). Returns both an access token (short-lived
   * JWT) and a refresh token (single-use, rotated on each /refresh call).
   *
   * If `markTrustedDevice` is true, also issues a trusted-device cookie value
   * the caller can set as an HttpOnly Secure cookie.
   */
  async issue(opts: {
    userId: string;
    primaryRoleName: string;
    primaryOrganizationId: string;
    ctx: RequestContext;
    markTrustedDevice?: { label: string };
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    expiresIn: number;
    trustedDeviceToken?: string;
  }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: opts.userId } });
    if (!user.isActive) throw new ForbiddenException('Account is deactivated');

    let trustedDeviceId: string | null = null;
    let trustedDeviceRaw: string | undefined;
    if (opts.markTrustedDevice) {
      const td = await this.createTrustedDevice(user.id, opts.markTrustedDevice.label, opts.ctx);
      trustedDeviceId = td.id;
      trustedDeviceRaw = td.rawToken;
    } else if (opts.ctx.trustedDeviceToken) {
      // Caller already has a trusted-device cookie; link the session to it.
      const td = await this.prisma.trustedDevice.findFirst({
        where: { deviceTokenHash: sha256(opts.ctx.trustedDeviceToken), userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      if (td) {
        await this.prisma.trustedDevice.update({
          where: { id: td.id },
          data: { lastSeenAt: new Date(), ipAddress: opts.ctx.ip?.slice(0, 64), userAgent: opts.ctx.userAgent?.slice(0, 500) },
        });
        trustedDeviceId = td.id;
      }
    }

    const family = randomToken(16); // family id rotates on each refresh; rotation detection works across the family
    const refreshRaw = randomToken(40);
    const refreshHash = sha256(refreshRaw);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: refreshHash,
        family,
        deviceLabel: opts.markTrustedDevice?.label,
        trustedDeviceId,
        ipAddress: opts.ctx.ip?.slice(0, 64),
        userAgent: opts.ctx.userAgent?.slice(0, 500),
        sessionVersion: user.sessionVersion,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400000),
      },
    });

    const accessToken = this.signAccessToken({
      sub: user.id,
      role: opts.primaryRoleName,
      organizationId: opts.primaryOrganizationId,
      sid: session.id,
      sv: user.sessionVersion,
    });

    return {
      accessToken,
      refreshToken: refreshRaw,
      sessionId: session.id,
      expiresIn: 15 * 60,
      trustedDeviceToken: trustedDeviceRaw,
    };
  }

  /**
   * Rotate a refresh token: revoke the old one, issue a new one, return a
   * fresh access+refresh pair. If the presented token is from a revoked
   * family (i.e. someone is replaying an already-rotated token), revoke
   * the whole family — likely a stolen-token replay.
   */
  async refresh(rawRefreshToken: string, ctx: RequestContext) {
    const refreshHash = sha256(rawRefreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: refreshHash },
      include: { user: true },
    });
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    if (session.revokedAt) {
      // Stolen-token replay: this token was already used or explicitly revoked.
      // Burn the whole family as a precaution.
      await this.prisma.session.updateMany({
        where: { family: session.family, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'family_compromised' },
      });
      throw new UnauthorizedException('Refresh token replay detected — all sessions in family revoked');
    }
    if (session.expiresAt < new Date()) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'expired' },
      });
      throw new UnauthorizedException('Refresh token expired');
    }
    if (session.sessionVersion !== session.user.sessionVersion) {
      // Force-logout has happened since this session was minted.
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'session_version_mismatch' },
      });
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (!session.user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Rotate: revoke old, mint new in same family.
    const newRaw = randomToken(40);
    const newHash = sha256(newRaw);
    const newSession = await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'rotated' },
      });
      return tx.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: newHash,
          family: session.family,
          deviceLabel: session.deviceLabel,
          trustedDeviceId: session.trustedDeviceId,
          ipAddress: ctx.ip?.slice(0, 64) ?? session.ipAddress,
          userAgent: ctx.userAgent?.slice(0, 500) ?? session.userAgent,
          sessionVersion: session.user.sessionVersion,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400000),
        },
      });
    });

    // Re-resolve the user's active role + org for the access token.
    const primaryRole = await this.prisma.userRole.findFirst({
      where: { userId: session.userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      include: { role: true, organization: true },
    });
    if (!primaryRole) throw new UnauthorizedException('User has no active roles');

    const accessToken = this.signAccessToken({
      sub: session.userId,
      role: primaryRole.role.name,
      organizationId: primaryRole.organizationId,
      sid: newSession.id,
      sv: session.user.sessionVersion,
    });
    return { accessToken, refreshToken: newRaw, sessionId: newSession.id, expiresIn: 15 * 60 };
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        deviceLabel: true,
        ipAddress: true,
        userAgent: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        trustedDevice: { select: { id: true, label: true } },
      },
    });
  }

  async revokeSession(sessionId: string, actor: Actor, reason = 'user_revoked') {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== actor.userId) {
      // Only an admin can revoke someone else's session
      if (!['hoa_admin', 'super_admin'].includes(actor.role)) {
        throw new ForbiddenException('Cannot revoke another user\'s session');
      }
    }
    if (session.revokedAt) return session;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokedReason: reason },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'session_revoked',
          entityType: 'Session',
          entityId: sessionId,
          changes: { targetUserId: session.userId, reason } as any,
        },
      });
      return updated;
    });
  }

  /** Force-logout every session for a user by bumping sessionVersion. */
  async forceLogoutAll(targetUserId: string, actor: Actor, reason = 'forced_logout') {
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: { sessionVersion: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'force_logout_all',
          entityType: 'User',
          entityId: targetUserId,
          changes: { reason } as any,
        },
      });
      return { ok: true };
    });
  }

  async listTrustedDevices(userId: string) {
    return this.prisma.trustedDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, label: true, ipAddress: true, userAgent: true, lastSeenAt: true, expiresAt: true, createdAt: true },
    });
  }

  async revokeTrustedDevice(deviceId: string, actor: Actor) {
    const td = await this.prisma.trustedDevice.findUnique({ where: { id: deviceId } });
    if (!td) throw new NotFoundException('Trusted device not found');
    if (td.userId !== actor.userId && !['hoa_admin', 'super_admin'].includes(actor.role)) {
      throw new ForbiddenException('Cannot revoke another user\'s trusted device');
    }
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.trustedDevice.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'trusted_device_revoked',
          entityType: 'TrustedDevice',
          entityId: deviceId,
          changes: {} as any,
        },
      });
      return r;
    });
  }

  private async createTrustedDevice(userId: string, label: string, ctx: RequestContext) {
    const raw = randomToken(40);
    const td = await this.prisma.trustedDevice.create({
      data: {
        userId,
        deviceTokenHash: sha256(raw),
        label,
        ipAddress: ctx.ip?.slice(0, 64),
        userAgent: ctx.userAgent?.slice(0, 500),
        expiresAt: new Date(Date.now() + TRUSTED_DEVICE_TTL_DAYS * 86400000),
      },
    });
    return { id: td.id, rawToken: raw };
  }

  private signAccessToken(payload: { sub: string; role: string; organizationId: string; sid: string; sv: number }) {
    return this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
  }

  /** Is the user's current request from a recognized trusted device? */
  async isTrustedDevice(userId: string, rawDeviceToken: string | undefined): Promise<boolean> {
    if (!rawDeviceToken) return false;
    const td = await this.prisma.trustedDevice.findFirst({
      where: {
        userId,
        deviceTokenHash: sha256(rawDeviceToken),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return !!td;
  }
}
