import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { sha256 } from '../common/encryption';

export type Actor = { userId: string; role: string; organizationId?: string };

const KEY_BYTES = 32; // 256 bits of entropy
const PREFIX_LEN = 12;
const MAX_PERMISSIONS = 64;
const MAX_NAME_LEN = 80;

/**
 * Phase 9.2 — Platform API keys.
 *
 * Plaintext shape: `hoa_live_<base64url-of-32-random-bytes>`. We hand it back
 * exactly once at creation and never persist it; the DB stores sha256(plain)
 * plus a UI-friendly 12-char prefix. Verification is O(1) via the hashedKey
 * unique index.
 *
 * Permission semantics: each key carries a list of permission slugs that mirror
 * the CustomRole alphabet (e.g. `invoices.read`, `payments.create`). Empty
 * array = no access. `*` is special and means full read+write for the org.
 */
@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  /** Create a new API key for the actor's org. Returns plaintext exactly once. */
  async create(
    actor: Actor,
    dto: { name: string; permissions: string[]; rateLimitPerMin?: number; expiresAt?: string },
  ) {
    if (!actor.organizationId) throw new ForbiddenException('No organization context');
    if (!dto.name || dto.name.length > MAX_NAME_LEN) {
      throw new BadRequestException('name is required (≤80 chars)');
    }
    if (!Array.isArray(dto.permissions) || dto.permissions.length === 0) {
      throw new BadRequestException('permissions[] required (use ["*"] for full access)');
    }
    if (dto.permissions.length > MAX_PERMISSIONS) {
      throw new BadRequestException(`Too many permissions (max ${MAX_PERMISSIONS})`);
    }
    for (const p of dto.permissions) {
      if (typeof p !== 'string' || !/^[a-z0-9_*.:-]+$/i.test(p) || p.length > 60) {
        throw new BadRequestException(`Invalid permission slug: ${p}`);
      }
    }
    if (dto.rateLimitPerMin !== undefined && (dto.rateLimitPerMin < 1 || dto.rateLimitPerMin > 10000)) {
      throw new BadRequestException('rateLimitPerMin must be 1..10000');
    }

    const plain = `hoa_live_${crypto.randomBytes(KEY_BYTES).toString('base64url')}`;
    const hashedKey = sha256(plain);
    const prefix = plain.slice(0, PREFIX_LEN);

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.apiKey.create({
        data: {
          organizationId: actor.organizationId!,
          name: dto.name,
          prefix,
          hashedKey,
          permissions: dto.permissions,
          rateLimitPerMin: dto.rateLimitPerMin,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          createdBy: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId!,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'api_key_created',
          entityType: 'ApiKey',
          entityId: row.id,
          changes: { name: row.name, prefix: row.prefix, permissions: row.permissions } as any,
        },
      });
      // Return plain ONCE. Caller is responsible for surfacing it to the user.
      return { ...row, plainKey: plain };
    });
  }

  async list(actor: Actor) {
    if (!actor.organizationId) throw new ForbiddenException('No organization context');
    return this.prisma.apiKey.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, name: true, prefix: true, permissions: true, isActive: true,
        rateLimitPerMin: true, expiresAt: true, lastUsedAt: true, lastUsedIp: true,
        createdAt: true, revokedAt: true, revokedReason: true, createdBy: true,
      },
    });
  }

  async revoke(actor: Actor, id: string, reason?: string) {
    if (!actor.organizationId) throw new ForbiddenException('No organization context');
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.apiKey.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('API key not found');
      if (row.organizationId !== actor.organizationId) {
        throw new ForbiddenException('Cannot revoke an API key from another organization');
      }
      if (row.revokedAt) return row;
      const updated = await tx.apiKey.update({
        where: { id },
        data: { isActive: false, revokedAt: new Date(), revokedReason: reason },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId!,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'api_key_revoked',
          entityType: 'ApiKey',
          entityId: id,
          changes: { reason } as any,
        },
      });
      return updated;
    });
  }

  /**
   * Verify an inbound key. Returns the key row + the org it belongs to. Used
   * by the auth guard. Touches `lastUsedAt` best-effort.
   */
  async verify(plain: string, ip?: string) {
    if (!plain || !plain.startsWith('hoa_live_')) return null;
    const hashed = sha256(plain);
    const row = await this.prisma.apiKey.findUnique({ where: { hashedKey: hashed } });
    if (!row) return null;
    if (!row.isActive || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt < new Date()) return null;
    // Fire-and-forget; never block auth on an analytics update.
    this.prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date(), lastUsedIp: ip?.slice(0, 64) } })
      .catch(() => {});
    return row;
  }
}
