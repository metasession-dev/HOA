import { Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../common/prisma.service';
import { MetricsService } from '../observability/metrics.service';

/**
 * Phase 10.1 — Web Push (RFC 8030) delivery.
 *
 * The browser-issued subscription is stored on `PushSubscription`. To send,
 * we ask `web-push` to encrypt + POST to the endpoint. The push service
 * (FCM / Mozilla / Apple) returns:
 *   201/204 — delivered
 *   404/410 — subscription expired; we mark `revokedAt` so future dispatches skip
 *   413     — payload too large
 *   429     — rate-limited; we surface upstream
 *
 * VAPID identity is initialised once at module load via env. If the keys are
 * missing the service still loads (so dev environments boot), but `sendTo*`
 * calls log a warning and short-circuit.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Per spec, max ~3,072 bytes after encryption — keep payloads small. */
  url?: string;
  /** Optional tag — duplicate notifications with the same tag collapse on the device. */
  tag?: string;
  /** Optional icon override (defaults to /icons/icon-192.png in the SW). */
  icon?: string;
  badge?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(private prisma: PrismaService, @Optional() private metrics?: MetricsService) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:notifications@hoa.africa';
    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv);
      this.enabled = true;
    } else {
      this.logger.warn('VAPID keys not configured — push delivery disabled. Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY.');
      this.enabled = false;
    }
  }

  /** Browsers need the VAPID public key to register a subscription. */
  getPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  /**
   * Persist (or update) a subscription for the calling user. Re-subscribing
   * from the same browser overwrites the existing keys — Chrome/Firefox
   * rotate auth secrets on permission re-grant, so we can't rely on identity.
   */
  async subscribe(opts: {
    userId: string;
    organizationId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
  }) {
    if (!opts.endpoint || !opts.p256dh || !opts.auth) {
      throw new BadRequestException('endpoint, p256dh and auth are required');
    }
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: opts.endpoint },
      update: {
        userId: opts.userId,
        organizationId: opts.organizationId,
        p256dh: opts.p256dh,
        auth: opts.auth,
        userAgent: opts.userAgent ?? null,
        failureCount: 0,
        revokedAt: null,
      },
      create: {
        userId: opts.userId,
        organizationId: opts.organizationId,
        endpoint: opts.endpoint,
        p256dh: opts.p256dh,
        auth: opts.auth,
        userAgent: opts.userAgent ?? null,
      },
    });
  }

  /** Revoke by subscription id (caller-owned only — controller enforces ownership). */
  async revoke(id: string) {
    return this.prisma.pushSubscription.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke by endpoint — used when the browser triggers `pushsubscriptionchange`. */
  async revokeByEndpoint(endpoint: string) {
    return this.prisma.pushSubscription.updateMany({
      where: { endpoint },
      data: { revokedAt: new Date() },
    });
  }

  /** List the calling user's active subscriptions (sans secrets). */
  async listForUser(userId: string) {
    const rows = await this.prisma.pushSubscription.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, endpoint: true, userAgent: true, lastSuccessAt: true, createdAt: true },
    });
    return rows;
  }

  /**
   * Send a payload to every active subscription belonging to a user. Tolerant
   * — one stale subscription doesn't fail the whole call. Returns delivery
   * counts for the caller's logs.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<{ delivered: number; revoked: number; failed: number }> {
    if (!this.enabled) return { delivered: 0, revoked: 0, failed: 0 };
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId, revokedAt: null },
    });
    return this.dispatch(subs, payload);
  }

  /** Bulk variant — sends to many users in parallel. */
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<{ delivered: number; revoked: number; failed: number }> {
    if (!this.enabled || userIds.length === 0) return { delivered: 0, revoked: 0, failed: 0 };
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds }, revokedAt: null },
    });
    return this.dispatch(subs, payload);
  }

  private async dispatch(
    subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
    payload: PushPayload,
  ): Promise<{ delivered: number; revoked: number; failed: number }> {
    let delivered = 0;
    let revoked = 0;
    let failed = 0;
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { TTL: 60 * 60 * 24 },
          );
          delivered += 1;
          await this.prisma.pushSubscription.update({
            where: { id: s.id },
            data: { lastSuccessAt: new Date(), failureCount: 0 },
          });
        } catch (err: any) {
          const status = typeof err?.statusCode === 'number' ? err.statusCode : 0;
          if (status === 404 || status === 410) {
            // Gone — subscription is dead.
            revoked += 1;
            await this.prisma.pushSubscription.update({
              where: { id: s.id },
              data: { revokedAt: new Date(), lastFailureAt: new Date() },
            });
          } else {
            failed += 1;
            this.logger.warn(`Push dispatch failed (status=${status}) for sub ${s.id}: ${err?.body ?? err?.message ?? err}`);
            await this.prisma.pushSubscription.update({
              where: { id: s.id },
              data: { failureCount: { increment: 1 }, lastFailureAt: new Date() },
            });
          }
        }
      }),
    );
    if (this.metrics) {
      if (delivered) this.metrics.pushDispatches.inc({ outcome: 'delivered' }, delivered);
      if (revoked) this.metrics.pushDispatches.inc({ outcome: 'revoked' }, revoked);
      if (failed) this.metrics.pushDispatches.inc({ outcome: 'failed' }, failed);
    }
    return { delivered, revoked, failed };
  }
}
