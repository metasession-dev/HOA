import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { sha256, randomToken } from '../common/encryption';
import { MailService } from '../mail/mail.service';

const TTL_MINUTES = 15;
const MAX_PER_HOUR_PER_EMAIL = 5;

export type RequestContext = { ip?: string; userAgent?: string };

@Injectable()
export class MagicLinksService {
  constructor(private prisma: PrismaService, private mail: MailService) {}

  /**
   * Issue a magic-link token for the given email if a user exists.
   *
   * Deliberately returns the same response shape whether or not the user
   * exists, so the endpoint cannot be used for email enumeration. The raw
   * token is returned in dev (so callers/tests can complete the loop without
   * Phase 2.2 email infra). In production it should only be sent via email.
   */
  async request(email: string, ctx: RequestContext) {
    const emailLower = email.trim().toLowerCase();
    if (!emailLower) throw new BadRequestException('Email is required');

    // Soft rate limit: max N issued per hour per email (per-IP throttling is the global throttler's job)
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.magicLink.count({
      where: { emailLower, createdAt: { gte: since } },
    });
    if (recent >= MAX_PER_HOUR_PER_EMAIL) {
      // Don't 429 — keep the response constant-time to avoid enumeration.
      // Just silently no-op.
      return { ok: true, devToken: null };
    }

    const user = await this.prisma.user.findUnique({ where: { email: emailLower } });
    let devToken: string | null = null;
    if (user && user.isActive) {
      const raw = randomToken(40);
      await this.prisma.magicLink.create({
        data: {
          userId: user.id,
          emailLower,
          tokenHash: sha256(raw),
          ipAddress: ctx.ip?.slice(0, 64),
          userAgent: ctx.userAgent?.slice(0, 500),
          expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
        },
      });
      // In non-production environments, return the raw token so testing
      // doesn't require email delivery. In production this must go through
      // the email worker (Phase 2.2).
      if (process.env.NODE_ENV !== 'production') {
        devToken = raw;
      }
      // Phase 2.2: actually mail the link. Fire-and-forget — never block the
      // login flow on a slow mail provider. The endpoint stays enumeration-
      // resistant because the mail enqueue happens after the constant-time
      // path completes.
      const loginUrl = `${process.env.RESIDENT_BASE_URL || 'http://localhost:3002'}/login?token=${raw}`;
      this.mail.enqueue({
        templateKey: 'magic_link',
        data: {
          recipientFirstName: user.firstName,
          loginUrl,
          expiresMinutes: TTL_MINUTES,
        },
        to: user.email,
        toName: `${user.firstName} ${user.lastName}`,
        toUserId: user.id,
        entityType: 'MagicLink',
        // Use the token hash so a re-request gets a fresh email.
        entityId: sha256(raw).slice(0, 16),
      }).catch(() => { /* swallow */ });
    }
    return { ok: true, devToken };
  }

  /**
   * Redeem a magic-link token. Returns the userId on success. Mutates the
   * row to mark it used; further attempts with the same token fail.
   */
  async redeem(rawToken: string): Promise<{ userId: string }> {
    const tokenHash = sha256(rawToken);
    return this.prisma.$transaction(async (tx) => {
      const ml = await tx.magicLink.findUnique({ where: { tokenHash } });
      if (!ml) throw new UnauthorizedException('Invalid or expired link');
      if (ml.usedAt) throw new UnauthorizedException('Link already used');
      if (ml.expiresAt < new Date()) throw new UnauthorizedException('Link has expired');
      if (!ml.userId) throw new UnauthorizedException('Link is not bound to a user');

      await tx.magicLink.update({ where: { id: ml.id }, data: { usedAt: new Date() } });

      // Invalidate any other pending magic links for this user — having
      // multiple live links increases the leak surface.
      await tx.magicLink.updateMany({
        where: { userId: ml.userId, usedAt: null, expiresAt: { gt: new Date() }, id: { not: ml.id } },
        data: { usedAt: new Date() },
      });

      return { userId: ml.userId };
    });
  }
}
