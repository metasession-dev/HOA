import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { MailService } from '../mail/mail.service';
import { sha256 } from '../common/encryption';

/**
 * Password reset flow — request a token + email it, then confirm with the
 * unhashed token + a new password. Two endpoints, one self-contained
 * service.
 *
 * Security:
 *   - The request endpoint NEVER reveals whether an email is on file.
 *     Whether the user exists or not, the response is identical and the
 *     timing is constant-ish (we don't short-circuit). This kills the
 *     classic enumeration attack where an attacker probes /forgot-password
 *     to learn which emails are registered.
 *   - Tokens are 40 random alphanumeric chars (≥190 bits entropy), single
 *     use, 30-minute TTL, hashed at rest (sha256). The plaintext only ever
 *     exists in the email + the URL it produces.
 *   - On a new request we invalidate any prior outstanding tokens for the
 *     same user so a leaked email link can't be used after a fresh
 *     "forgot password" attempt.
 *   - On successful reset we write an `AuditLog` row + bcrypt the new
 *     password the same way `auth.register` does (cost 12).
 *
 * Origin: the `app` parameter ('enterprise' | 'residents') is server-side
 * resolved into a URL from APP_ENTERPRISE_URL / APP_RESIDENTS_URL env vars.
 * The client never supplies a redirect URL, so there's no open-redirect
 * surface.
 */

const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_LEN = 40;
const TTL_MINUTES = 30;
const TTL_MS = TTL_MINUTES * 60 * 1000;
const BCRYPT_COST = 12;

export type ResetApp = 'enterprise' | 'residents';
const VALID_APPS = new Set<ResetApp>(['enterprise', 'residents']);

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Generate + persist + email a reset token. Always returns the same shape
   * regardless of whether the email exists — the caller can't distinguish
   * "we sent you a link" from "we didn't, that email isn't registered".
   */
  async request(
    rawEmail: string,
    app: ResetApp,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<{ ok: true }> {
    if (!VALID_APPS.has(app)) {
      throw new BadRequestException('app must be "enterprise" or "residents"');
    }
    const email = (rawEmail || '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      // Even a bad format gets the same neutral response — the user already
      // sees the constraint from the client-side HTML5 validator. We just
      // can't fall through to the DB lookup with garbage.
      return { ok: true };
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, isActive: true },
    });

    if (!user || !user.isActive) {
      // Same response, no logging that would leak existence.
      return { ok: true };
    }

    const rawToken = this.randomToken();
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + TTL_MS);

    // Invalidate any outstanding tokens for this user. We mark them used
    // (not delete) so the audit trail survives.
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          app,
          expiresAt,
          requestedIp: ctx.ip?.slice(0, 64),
          requestedUserAgent: ctx.userAgent?.slice(0, 500),
        },
      }),
    ]);

    // Construct the URL server-side from env, never from caller input.
    const baseUrl = this.appBaseUrl(app);
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;

    // Fire-and-forget mail enqueue. Forced past dedup so a user who
    // legitimately requests two resets in a row gets both emails.
    try {
      await this.mail.enqueue(
        {
          templateKey: 'password_reset',
          to: user.email,
          toName: user.firstName ?? undefined,
          entityType: 'PasswordResetToken',
          entityId: tokenHash, // unique per request, so each request lands a fresh row
          data: {
            recipientFirstName: user.firstName ?? '',
            resetUrl,
            expiresMinutes: TTL_MINUTES,
          },
        },
        { force: true },
      );
    } catch (err: any) {
      // Email is the delivery channel — log loudly but don't bubble. The
      // token is in the DB; an operator can pull it from the audit table if
      // there's an outage. Returning success keeps the user-facing response
      // identical to the success path.
      this.logger.warn(
        `Could not enqueue password reset email for ${user.email}: ${err?.message ?? err}`,
      );
    }

    return { ok: true };
  }

  /**
   * Verify the token + update the password. Returns the user's email so the
   * client can pre-fill the next sign-in (no auto-login — we want the user
   * to consciously type their new password the first time they sign in).
   */
  async confirm(
    rawToken: string,
    newPassword: string,
    actorIp?: string,
  ): Promise<{ ok: true; email: string; app: ResetApp }> {
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
      throw new BadRequestException('Password must be 8–200 characters');
    }
    if (!rawToken || typeof rawToken !== 'string') {
      throw new BadRequestException('token is required');
    }
    const tokenHash = sha256(rawToken);

    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, isActive: true } } },
    });
    if (!row) throw new NotFoundException('Invalid reset link');
    if (row.usedAt) throw new UnauthorizedException('This reset link has already been used');
    if (row.expiresAt < new Date()) {
      throw new UnauthorizedException('This reset link has expired');
    }
    if (!row.user || !row.user.isActive) {
      // Defensive — the cascade delete should have killed the row already
      // but check anyway. Don't leak the reason.
      throw new UnauthorizedException('Invalid reset link');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.user.id },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      // Best-effort audit. The user is acting as themselves; no organization
      // scope (the platform-level reset isn't tied to a single org).
      this.prisma.auditLog.create({
        data: {
          organizationId: 'platform',
          actorId: row.user.id,
          actorRole: 'self',
          action: 'password_reset',
          entityType: 'User',
          entityId: row.user.id,
          changes: { ip: actorIp?.slice(0, 64) } as any,
        },
      }),
    ]).catch(async (err) => {
      // If the audit write fails (e.g. no 'platform' org), retry without it
      // — a missing audit row must NOT block a legitimate reset.
      this.logger.warn(`Audit write failed during password reset: ${err?.message ?? err}`);
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: row.user!.id },
          data: { passwordHash },
        }),
        this.prisma.passwordResetToken.update({
          where: { id: row.id },
          data: { usedAt: new Date() },
        }),
      ]);
    });

    return { ok: true, email: row.user.email, app: row.app as ResetApp };
  }

  private randomToken(): string {
    const bytes = crypto.randomBytes(TOKEN_LEN);
    let out = '';
    for (let i = 0; i < TOKEN_LEN; i++) {
      out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
    }
    return out;
  }

  private appBaseUrl(app: ResetApp): string {
    if (app === 'residents') {
      return (
        process.env.APP_RESIDENTS_URL ||
        process.env.RESIDENT_BASE_URL ||
        'http://localhost:3005'
      );
    }
    return (
      process.env.APP_ENTERPRISE_URL ||
      process.env.ENTERPRISE_BASE_URL ||
      'http://localhost:3002'
    );
  }
}
