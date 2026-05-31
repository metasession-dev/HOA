import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { encrypt, decrypt } from '../common/encryption';

/**
 * Per-organization Paystack configuration.
 *
 * Each HOA stores its own Paystack credentials so funds settle into its own
 * account. The secret key is encrypted at rest (AES-256-GCM) and never leaves
 * the server — the API only ever exposes whether a secret is set, plus the
 * non-sensitive public key / subaccount / flags.
 *
 * `getResolvedCredentials()` is the single read path the payment flow uses to
 * obtain a usable secret: the org's encrypted key when enabled, otherwise the
 * platform env key as a legacy fallback (so an existing global-key deployment
 * keeps working through the transition).
 */
export interface ResolvedPaystackCreds {
  secretKey: string;
  publicKey: string | null;
  subaccountCode: string | null;
  feeBearer: string;
  source: 'org' | 'env';
}

@Injectable()
export class PaymentConfigService {
  private readonly logger = new Logger(PaymentConfigService.name);

  constructor(private prisma: PrismaService) {}

  /** Non-sensitive view for the admin settings page. Never returns the secret. */
  async getPublicConfig(orgId: string) {
    const cfg = await this.prisma.paystackConfig.findUnique({ where: { organizationId: orgId } });
    return {
      publicKey: cfg?.publicKey ?? null,
      subaccountCode: cfg?.subaccountCode ?? null,
      feeBearer: cfg?.feeBearer ?? 'account',
      isEnabled: cfg?.isEnabled ?? false,
      testMode: cfg?.testMode ?? true,
      // Whether a secret key is on file — lets the UI show "configured" without
      // ever shipping the secret to the client.
      secretKeySet: !!cfg?.secretKeyEncrypted,
    };
  }

  /**
   * Upsert the org's Paystack config. The secret key is only (re)written when a
   * non-empty value is supplied — passing it blank leaves the stored key intact,
   * so the settings form never needs to round-trip the secret.
   */
  async update(
    orgId: string,
    actor: { userId: string; role: string },
    dto: {
      publicKey?: string | null;
      secretKey?: string | null;
      subaccountCode?: string | null;
      feeBearer?: string | null;
      isEnabled?: boolean;
      testMode?: boolean;
    },
  ) {
    const data: Record<string, any> = {};
    if (dto.publicKey !== undefined) data.publicKey = dto.publicKey?.trim() || null;
    if (dto.subaccountCode !== undefined) data.subaccountCode = dto.subaccountCode?.trim() || null;
    if (dto.feeBearer !== undefined) data.feeBearer = dto.feeBearer === 'subaccount' ? 'subaccount' : 'account';
    if (dto.isEnabled !== undefined) data.isEnabled = !!dto.isEnabled;
    if (dto.testMode !== undefined) data.testMode = !!dto.testMode;
    if (typeof dto.secretKey === 'string' && dto.secretKey.trim().length > 0) {
      data.secretKeyEncrypted = encrypt(dto.secretKey.trim());
    }

    const existing = await this.prisma.paystackConfig.findUnique({ where: { organizationId: orgId } });

    // Guard: can't enable live payments without a secret key on file.
    const willHaveSecret = data.secretKeyEncrypted !== undefined || !!existing?.secretKeyEncrypted;
    if (data.isEnabled && !willHaveSecret) {
      throw new Error('A Paystack secret key is required before enabling payments.');
    }

    const saved = await this.prisma.paystackConfig.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, ...data },
      update: data,
    });

    // Audit trail — never log the secret itself, only that it changed.
    await this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'paystack_config_updated',
        entityType: 'PaystackConfig',
        entityId: saved.id,
        changes: {
          publicKeySet: !!saved.publicKey,
          secretKeyChanged: data.secretKeyEncrypted !== undefined,
          subaccountCode: saved.subaccountCode,
          feeBearer: saved.feeBearer,
          isEnabled: saved.isEnabled,
          testMode: saved.testMode,
        } as any,
      },
    });

    return this.getPublicConfig(orgId);
  }

  /**
   * Resolve usable Paystack credentials for `orgId`. Prefers the org's own
   * encrypted key when enabled; falls back to the platform env key (legacy).
   * Returns null when neither is available — the caller decides whether to mock
   * (dev) or refuse (prod).
   */
  async getResolvedCredentials(orgId: string): Promise<ResolvedPaystackCreds | null> {
    const cfg = await this.prisma.paystackConfig.findUnique({ where: { organizationId: orgId } });
    if (cfg?.isEnabled && cfg.secretKeyEncrypted) {
      try {
        return {
          secretKey: decrypt(cfg.secretKeyEncrypted),
          publicKey: cfg.publicKey ?? null,
          subaccountCode: cfg.subaccountCode ?? null,
          feeBearer: cfg.feeBearer || 'account',
          source: 'org',
        };
      } catch (err) {
        this.logger.error(`Failed to decrypt Paystack secret for org ${orgId}: ${(err as any)?.message ?? err}`);
        return null;
      }
    }
    const envKey = process.env.PAYSTACK_SECRET_KEY;
    if (envKey) {
      return {
        secretKey: envKey,
        publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? null,
        subaccountCode: null,
        feeBearer: 'account',
        source: 'env',
      };
    }
    return null;
  }
}
