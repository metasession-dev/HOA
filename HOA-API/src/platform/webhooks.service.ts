import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { URL } from 'url';
import * as net from 'net';
import * as dns from 'dns';
import { promisify } from 'util';
import { PrismaService } from '../common/prisma.service';

const dnsLookup = promisify(dns.lookup);

export type Actor = { userId: string; role: string; organizationId?: string };

const MAX_URL_LEN = 2048;
const MAX_NAME_LEN = 80;
const SECRET_BYTES = 32;
const MAX_RESPONSE_BODY = 4096;
const DELIVERY_TIMEOUT_MS = 5_000;
const DISABLE_AFTER_FAILURES = 20;
const MAX_ATTEMPTS = 5;

// Phase 9.2 event catalogue. Anything not in this list is rejected on subscribe
// to keep the surface area auditable.
export const ALLOWED_EVENTS = [
  'payment.received',
  'payment.failed',
  'invoice.created',
  'invoice.overdue',
  'violation.created',
  'violation.resolved',
  'gate_pass.created',
  'gate_pass.used',
  'request.submitted',
  'request.resolved',
  'vendor_invoice.awaiting_approval',
  'vendor_invoice.approved',
  'vendor_invoice.paid',
  'user.invited',
  'broadcast.sent',
] as const;
export type WebhookEvent = typeof ALLOWED_EVENTS[number];

/**
 * Strip the secret + any sensitive fields when returning a webhook endpoint
 * to a caller or persisting into the audit log. The dispatcher uses a
 * direct read with `select: { secret: true }` when it needs the secret for
 * signing — no other code path should see it.
 */
function pickEndpointSafeFields(ep: any) {
  return {
    id: ep.id,
    organizationId: ep.organizationId,
    name: ep.name,
    url: ep.url,
    events: ep.events,
    description: ep.description,
    isActive: ep.isActive,
    consecutiveFailures: ep.consecutiveFailures,
    disableAfterFailures: ep.disableAfterFailures,
    createdAt: ep.createdAt,
    updatedAt: ep.updatedAt,
    lastDeliveryAt: ep.lastDeliveryAt,
    createdBy: ep.createdBy,
  };
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  // ============== ENDPOINTS (admin CRUD) ==============

  async listEndpoints(actor: Actor) {
    if (!actor.organizationId) throw new ForbiddenException('No organization context');
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(pickEndpointSafeFields);
  }

  async createEndpoint(
    actor: Actor,
    dto: { name: string; url: string; events: string[]; description?: string },
  ) {
    if (!actor.organizationId) throw new ForbiddenException('No organization context');
    if (!dto.name || dto.name.length > MAX_NAME_LEN) {
      throw new BadRequestException('name is required (≤80 chars)');
    }
    await this.validateUrl(dto.url);
    if (!Array.isArray(dto.events) || dto.events.length === 0) {
      throw new BadRequestException('events[] required');
    }
    for (const ev of dto.events) {
      if (!ALLOWED_EVENTS.includes(ev as WebhookEvent)) {
        throw new BadRequestException(`Unknown event: ${ev}`);
      }
    }
    const secret = crypto.randomBytes(SECRET_BYTES).toString('hex');
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.webhookEndpoint.create({
        data: {
          organizationId: actor.organizationId!,
          name: dto.name,
          url: dto.url,
          secret,
          events: dto.events,
          description: dto.description,
          createdBy: actor.userId,
          disableAfterFailures: DISABLE_AFTER_FAILURES,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId!,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'webhook_endpoint_created',
          entityType: 'WebhookEndpoint',
          entityId: row.id,
          changes: { name: row.name, url: row.url, events: row.events } as any,
        },
      });
      // Return secret ONCE.
      return row;
    });
  }

  async updateEndpoint(
    actor: Actor,
    id: string,
    dto: { name?: string; url?: string; events?: string[]; isActive?: boolean; description?: string },
  ) {
    if (!actor.organizationId) throw new ForbiddenException('No organization context');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.webhookEndpoint.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Endpoint not found');
      if (existing.organizationId !== actor.organizationId) {
        throw new ForbiddenException('Cannot edit endpoint in another organization');
      }
      if (dto.url) await this.validateUrl(dto.url);
      if (dto.events) {
        for (const ev of dto.events) {
          if (!ALLOWED_EVENTS.includes(ev as WebhookEvent)) {
            throw new BadRequestException(`Unknown event: ${ev}`);
          }
        }
      }
      const updated = await tx.webhookEndpoint.update({
        where: { id },
        data: {
          name: dto.name,
          url: dto.url,
          events: dto.events,
          isActive: dto.isActive,
          description: dto.description,
          // Reactivating clears the failure counter so we don't immediately
          // disable again on the first bump.
          ...(dto.isActive === true ? { consecutiveFailures: 0 } : {}),
        },
      });
      // Review #3/#11: never spread DB rows into audit log payloads — the
      // secret would silently land in immutable storage on a future schema
      // change. Pluck explicit fields.
      const safeBefore = pickEndpointSafeFields(existing);
      const safeAfter = pickEndpointSafeFields(updated);
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId!,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'webhook_endpoint_updated',
          entityType: 'WebhookEndpoint',
          entityId: id,
          changes: { before: safeBefore, after: safeAfter } as any,
        },
      });
      return safeAfter;
    });
  }

  async rotateSecret(actor: Actor, id: string) {
    if (!actor.organizationId) throw new ForbiddenException('No organization context');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.webhookEndpoint.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Endpoint not found');
      if (existing.organizationId !== actor.organizationId) {
        throw new ForbiddenException('Cannot rotate endpoint in another organization');
      }
      const secret = crypto.randomBytes(SECRET_BYTES).toString('hex');
      await tx.webhookEndpoint.update({ where: { id }, data: { secret } });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId!,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'webhook_endpoint_rotated',
          entityType: 'WebhookEndpoint',
          entityId: id,
          changes: {} as any,
        },
      });
      // Return only the new secret + id — no row spread.
      return { id, secret };
    });
  }

  async deleteEndpoint(actor: Actor, id: string) {
    if (!actor.organizationId) throw new ForbiddenException('No organization context');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.webhookEndpoint.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Endpoint not found');
      if (existing.organizationId !== actor.organizationId) {
        throw new ForbiddenException('Cannot delete endpoint in another organization');
      }
      await tx.webhookEndpoint.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId!,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'webhook_endpoint_deleted',
          entityType: 'WebhookEndpoint',
          entityId: id,
          changes: { name: existing.name, url: existing.url } as any,
        },
      });
      return { ok: true };
    });
  }

  // ============== DELIVERIES ==============

  async listDeliveries(actor: Actor, endpointId?: string, take = 50) {
    if (!actor.organizationId) throw new ForbiddenException('No organization context');
    const where: any = { organizationId: actor.organizationId };
    if (endpointId) where.endpointId = endpointId;
    return this.prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, take)),
      select: {
        id: true, event: true, status: true, attempt: true, maxAttempts: true,
        responseStatus: true, errorMessage: true, deliveredAt: true, createdAt: true,
        nextAttemptAt: true, endpointId: true,
      },
    });
  }

  // ============== DISPATCH ==============

  /**
   * Emit an event to all endpoints in `organizationId` subscribed to it. Fan-
   * out is fire-and-forget on this thread (the work happens in a microtask) so
   * callers in mutation paths don't block on outbound HTTP. Each delivery has
   * its own row + retry schedule.
   */
  emit(organizationId: string, event: WebhookEvent, data: Record<string, any>) {
    setImmediate(() => {
      this.fanOut(organizationId, event, data).catch((err) => {
        this.logger.error(`emit ${event} failed for org=${organizationId}: ${err?.message}`);
      });
    });
  }

  private async fanOut(organizationId: string, event: string, data: Record<string, any>) {
    // Review #10: explicit subscription only — no implicit wildcard via empty
    // events array. The schema-comment "empty = match everything" was a
    // footgun where a UPDATE of `events: []` silently widened scope without
    // any audit signal.
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        organizationId,
        isActive: true,
        events: { has: event },
      },
    });
    for (const ep of endpoints) {
      try {
        const occurredAt = new Date();
        const payload = {
          id: `evt_${crypto.randomBytes(12).toString('hex')}`,
          type: event,
          occurredAt: occurredAt.toISOString(),
          organizationId,
          data,
        };
        const body = JSON.stringify(payload);
        const timestamp = Math.floor(occurredAt.getTime() / 1000);
        // Review #9: sign `v1.<timestamp>.<body>` so the timestamp is bound
        // into the HMAC. Receivers reject signatures with stale timestamps to
        // defeat replay attacks.
        const signature = this.signWithTimestamp(body, timestamp, ep.secret);
        const delivery = await this.prisma.webhookDelivery.create({
          data: {
            organizationId,
            endpointId: ep.id,
            event,
            payload: payload as any,
            signature: `t=${timestamp},v1=${signature}`,
            status: 'pending',
            attempt: 1,
            maxAttempts: MAX_ATTEMPTS,
            nextAttemptAt: new Date(),
          },
        });
        // Attempt once inline; retries happen via cron (deliverPending).
        await this.attemptDelivery(delivery.id);
      } catch (err: any) {
        this.logger.warn(`enqueue delivery failed ep=${ep.id}: ${err.message}`);
      }
    }
  }

  /**
   * Take one delivery row and POST it. Review #7: atomically claim the row
   * (`status='pending' → 'in_progress'`) via a CAS update so concurrent
   * cron / inline invocations don't both dispatch the same delivery.
   */
  async attemptDelivery(deliveryId: string) {
    // CAS-claim: only one worker can flip pending → in_progress for this row.
    const claim = await this.prisma.webhookDelivery.updateMany({
      where: { id: deliveryId, status: 'pending' },
      data: { status: 'in_progress' },
    });
    if (claim.count === 0) return;

    const d = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true },
    });
    if (!d) return;
    if (!d.endpoint.isActive) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'dead', errorMessage: 'endpoint inactive' },
      });
      return;
    }

    const body = JSON.stringify(d.payload);
    // Extract t=<timestamp>,v1=<hex> from the stored signature so the
    // outgoing header timestamp matches what was signed at fan-out time.
    let outTimestamp = Math.floor(Date.now() / 1000);
    let outSignatureHex = d.signature;
    const m = /^t=(\d+),v1=([0-9a-f]+)$/.exec(d.signature);
    if (m) {
      outTimestamp = Number(m[1]);
      outSignatureHex = m[2];
    }

    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;
    let ok = false;

    try {
      // Re-validate URL right before send to defeat TOCTOU between endpoint
      // create and dispatch (DNS rebinding etc.).
      await this.validateUrl(d.endpoint.url);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), DELIVERY_TIMEOUT_MS);
      try {
        const res = await fetch(d.endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'HOA.africa-Webhooks/1.0',
            'X-HOA-Event': d.event,
            'X-HOA-Delivery': d.id,
            'X-HOA-Signature': `t=${outTimestamp},v1=${outSignatureHex}`,
            'X-HOA-Timestamp': String(outTimestamp),
          },
          body,
          signal: ctrl.signal,
          redirect: 'manual', // refuse to follow redirects (SSRF defense)
        });
        responseStatus = res.status;
        try {
          const text = await res.text();
          responseBody = text.slice(0, MAX_RESPONSE_BODY);
        } catch { /* ignore */ }
        ok = res.ok;
      } finally {
        clearTimeout(t);
      }
    } catch (err: any) {
      errorMessage = (err?.message || 'fetch failed').slice(0, 500);
    }

    if (ok) {
      await this.prisma.$transaction([
        this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: 'success', responseStatus, responseBody, deliveredAt: new Date(), errorMessage: null },
        }),
        this.prisma.webhookEndpoint.update({
          where: { id: d.endpoint.id },
          data: { consecutiveFailures: 0, lastDeliveryAt: new Date() },
        }),
      ]);
      return;
    }

    // Review #6: atomic failure counter update. Compute auto-disable inside
    // a single SQL statement so a manual disable (or concurrent success
    // resetting the counter) can't be clobbered by app-level logic.
    const willRetry = d.attempt < d.maxAttempts;
    const nextAt = willRetry ? this.nextRetryAt(d.attempt) : null;
    await this.prisma.$transaction([
      this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: willRetry ? 'pending' : 'dead',
          responseStatus,
          responseBody,
          errorMessage,
          attempt: d.attempt + 1,
          nextAttemptAt: nextAt,
        },
      }),
      this.prisma.$executeRaw`
        UPDATE webhook_endpoints
        SET
          consecutive_failures = consecutive_failures + 1,
          last_delivery_at = NOW(),
          is_active = CASE
            WHEN is_active = false THEN false
            WHEN consecutive_failures + 1 >= disable_after_failures THEN false
            ELSE is_active
          END
        WHERE id = ${d.endpoint.id}
      `,
    ]);
  }

  /** Cron entrypoint — pulls all due deliveries and reattempts them. */
  async deliverPending(limit = 50) {
    const due = await this.prisma.webhookDelivery.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
    });
    for (const d of due) {
      try { await this.attemptDelivery(d.id); } catch { /* swallow */ }
    }
    return { processed: due.length };
  }

  /**
   * Admin "Send test event" flow. Doesn't write a delivery row that anyone
   * would expect to survive; just synthesises a fake payload and fires once.
   */
  async testFire(actor: Actor, endpointId: string) {
    if (!actor.organizationId) throw new ForbiddenException('No organization context');
    const ep = await this.prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
    if (!ep) throw new NotFoundException('Endpoint not found');
    if (ep.organizationId !== actor.organizationId) {
      throw new ForbiddenException('Cannot test endpoint in another organization');
    }
    const occurredAt = new Date();
    const payload = {
      id: `evt_test_${crypto.randomBytes(8).toString('hex')}`,
      type: 'ping',
      occurredAt: occurredAt.toISOString(),
      organizationId: actor.organizationId,
      data: { message: 'Test event from HOA.africa', actorId: actor.userId },
    };
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(occurredAt.getTime() / 1000);
    const signature = this.signWithTimestamp(body, timestamp, ep.secret);
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        organizationId: actor.organizationId,
        endpointId: ep.id,
        event: 'ping',
        payload: payload as any,
        signature: `t=${timestamp},v1=${signature}`,
        status: 'pending',
        attempt: 1,
        maxAttempts: 1, // no retries on a test
        nextAttemptAt: new Date(),
      },
    });
    await this.attemptDelivery(delivery.id);
    return this.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  }

  // ============== SIGNING ==============

  /**
   * HMAC-SHA256 over `v1.<unix-seconds>.<raw body>`. Receivers should verify
   * the signature AND reject if `|now - timestamp|` exceeds their tolerance
   * (5 minutes recommended) so a captured payload can't be replayed
   * indefinitely. Phase 9.2 review #9.
   */
  signWithTimestamp(body: string, timestamp: number, secret: string): string {
    const signedBytes = `v1.${timestamp}.${body}`;
    return crypto.createHmac('sha256', secret).update(signedBytes).digest('hex');
  }

  // ============== INTERNAL HELPERS ==============

  /**
   * Validate URL: https only, no private/loopback/reserved hosts. Phase 9.2
   * review #2: resolve the hostname and refuse if **any** A/AAAA record is
   * an internal IP. Defeats SSRF via DNS-rebound hostnames (`evil.com`
   * resolving to `127.0.0.1`). In dev (`WEBHOOKS_ALLOW_HTTP=1`) we permit
   * http + loopback so devs can target a localhost receiver.
   *
   * Async: callers must await. Validate-on-fetch happens again inside
   * `attemptDelivery` so rebinding after-the-fact is also caught.
   */
  private async validateUrl(raw: string) {
    if (!raw || raw.length > MAX_URL_LEN) throw new BadRequestException('Invalid URL');
    let parsed: URL;
    try { parsed = new URL(raw); } catch { throw new BadRequestException('Malformed URL'); }
    const allowDev = process.env.WEBHOOKS_ALLOW_HTTP === '1';
    if (parsed.protocol !== 'https:') {
      if (parsed.protocol !== 'http:' || !allowDev) {
        throw new BadRequestException('Webhook URL must use https');
      }
    }
    const host = parsed.hostname.toLowerCase();
    // Refuse hostname patterns the cloud world reserves for internal use.
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
      throw new BadRequestException('Webhook URL must point to a public host');
    }
    if (host === 'metadata.google.internal' || host === 'metadata.internal') {
      throw new BadRequestException('Webhook URL must point to a public host');
    }
    if (!allowDev && (host === 'localhost' || host === '0.0.0.0')) {
      throw new BadRequestException('Webhook URL must point to a public host');
    }

    // Collect the IPs we'll check — either the literal IP in the URL or
    // every A/AAAA record DNS hands back.
    const ipsToCheck: string[] = [];
    if (net.isIP(host)) {
      ipsToCheck.push(host);
    } else {
      try {
        const records = await dnsLookup(host, { all: true });
        for (const r of records) ipsToCheck.push(r.address);
      } catch {
        throw new BadRequestException(`Unable to resolve host: ${host}`);
      }
    }
    if (ipsToCheck.length === 0) {
      throw new BadRequestException(`No DNS records for host: ${host}`);
    }
    for (const ip of ipsToCheck) {
      this.assertPublicIp(ip, allowDev);
    }
  }

  /** Throw if `ip` is in any reserved/private/loopback/link-local/multicast range. */
  private assertPublicIp(ip: string, allowDev: boolean) {
    const v = net.isIP(ip);
    if (v === 4) {
      const octets = ip.split('.').map(Number);
      const isLoopback = octets[0] === 127;
      const isPrivate =
        octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168);
      const isLinkLocal = octets[0] === 169 && octets[1] === 254;
      const isMulticast = octets[0] >= 224;
      const isCgnat = octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
      const isBenchmark = octets[0] === 198 && (octets[1] === 18 || octets[1] === 19);
      const isReservedZero = octets[0] === 0;
      if ((isLoopback && !allowDev) || isPrivate || isLinkLocal || isMulticast ||
          isCgnat || isBenchmark || isReservedZero) {
        throw new BadRequestException(`Webhook URL resolves to non-public IP: ${ip}`);
      }
    } else if (v === 6) {
      const lower = ip.toLowerCase();
      const isLoopback6 = lower === '::1';
      const isUlaOrLinkLocal = lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
      const isMulticast6 = lower.startsWith('ff');
      const isIpv4Mapped = lower.startsWith('::ffff:') || lower.startsWith('64:ff9b::');
      if ((isLoopback6 && !allowDev) || isUlaOrLinkLocal || isMulticast6 || isIpv4Mapped) {
        throw new BadRequestException(`Webhook URL resolves to non-public IPv6: ${ip}`);
      }
    } else {
      throw new BadRequestException(`Unable to parse IP: ${ip}`);
    }
  }

  private nextRetryAt(attempt: number): Date {
    // Exponential backoff: 1m, 5m, 15m, 60m, 360m...
    const minutes = [1, 5, 15, 60, 360, 1440][Math.min(attempt - 1, 5)] || 1440;
    return new Date(Date.now() + minutes * 60_000);
  }
}
