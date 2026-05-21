import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma.service';
import { encrypt, decrypt, sha256 } from '../common/encryption';

// TOTP options: 30s step, 6-digit codes. Window of ±1 step accommodates clock drift.
const TOTP_OPTIONS = { period: 30, digits: 6 as const, window: 1 };

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 10;

export type Actor = { userId: string; role: string };

@Injectable()
export class MfaService {
  constructor(private prisma: PrismaService) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabled: true, totpEnabledAt: true, recoveryCodesHashed: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      totpEnabled: user.totpEnabled,
      totpEnabledAt: user.totpEnabledAt,
      recoveryCodesRemaining: user.recoveryCodesHashed.length,
    };
  }

  /**
   * Start enrollment. Generates a TOTP secret, stores it encrypted with
   * totpEnabled=false (pending), and returns the secret + otpauth URI + QR
   * payload for the client to render. Caller must POST /verify-enrollment
   * with a valid code to actually enable MFA.
   */
  async startEnrollment(userId: string, userEmail: string, orgName?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.totpEnabled) {
      throw new ConflictException('MFA is already enabled. Disable it first to re-enroll.');
    }
    const secret = generateSecret({ length: 20 });
    const issuer = orgName ? `HOA.africa (${orgName})` : 'HOA.africa';
    const otpauthUri = generateURI({
      strategy: 'totp',
      issuer,
      label: userEmail,
      secret,
      digits: TOTP_OPTIONS.digits,
      period: TOTP_OPTIONS.period,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEncrypted: encrypt(secret), totpEnabled: false },
    });
    return { secret, otpauthUri };
  }

  /**
   * Verify the user can produce a valid TOTP from their authenticator, then
   * flip totpEnabled=true and generate one-time recovery codes (the raw codes
   * are only returned ONCE here; the DB persists sha256 hashes).
   */
  async verifyEnrollment(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.totpSecretEncrypted) {
      throw new BadRequestException('No enrollment in progress. Start enrollment first.');
    }
    if (user.totpEnabled) {
      throw new ConflictException('MFA is already enabled');
    }
    const secret = decrypt(user.totpSecretEncrypted);
    const { valid } = verifySync({ strategy: 'totp', secret, token: code, ...TOTP_OPTIONS });
    if (!valid) {
      throw new UnauthorizedException('Invalid code');
    }

    const recoveryCodes = this.generateRecoveryCodes();
    // Hash the normalized form (no dashes, no spaces) so user paste with/without
    // formatting works at verify time.
    const hashed = recoveryCodes.map((c) => sha256(c.replace(/[\s-]/g, '')));

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          totpEnabled: true,
          totpEnabledAt: new Date(),
          recoveryCodesHashed: hashed,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorRole: 'self',
          action: 'mfa_enabled',
          entityType: 'User',
          entityId: userId,
          changes: { method: 'totp', recoveryCodesGenerated: recoveryCodes.length } as any,
        },
      }),
    ]);

    return { recoveryCodes };
  }

  async disable(userId: string, password: string, mfaCode: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.totpEnabled) {
      throw new ConflictException('MFA is not enabled');
    }
    // Phase 6 review #6: require BOTH password AND second factor. Verifying
    // the second factor before any state mutation closes the phished-password
    // disable path. We accept TOTP or recovery code.
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid password');
    const method = await this.verifyCodeForLogin(userId, mfaCode);
    if (!method) throw new UnauthorizedException('Invalid MFA code');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          totpEnabled: false,
          totpSecretEncrypted: null,
          totpEnabledAt: null,
          recoveryCodesHashed: [],
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorRole: 'self',
          action: 'mfa_disabled',
          entityType: 'User',
          entityId: userId,
          changes: {} as any,
        },
      }),
    ]);
    return { ok: true };
  }

  /**
   * Verify a TOTP code OR a recovery code. Used at login. Recovery codes are
   * single-use — the matched hash is removed from the user's set on success.
   */
  async verifyCodeForLogin(userId: string, code: string): Promise<'totp' | 'recovery' | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpEnabled || !user.totpSecretEncrypted) return null;
    const cleaned = code.replace(/\s|-/g, '');
    // Try TOTP
    try {
      const secret = decrypt(user.totpSecretEncrypted);
      const { valid } = verifySync({ strategy: 'totp', secret, token: cleaned, ...TOTP_OPTIONS });
      if (valid) return 'totp';
    } catch { /* fall through */ }
    // Recovery code: atomic conditional update via array_remove. The UPDATE
    // succeeds only if the hash is still present in the array; if two requests
    // race for the same code, exactly one rowcount=1 returns. The previous
    // read-then-filter-write pattern allowed both to succeed.
    const candidateHash = sha256(cleaned);
    const affected = await this.prisma.$executeRaw`
      UPDATE users
         SET "recoveryCodesHashed" = array_remove("recoveryCodesHashed", ${candidateHash})
       WHERE id = ${userId}
         AND ${candidateHash} = ANY("recoveryCodesHashed")
    `;
    if (affected === 1) {
      const after = await this.prisma.user.findUnique({
        where: { id: userId }, select: { recoveryCodesHashed: true },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorRole: 'self',
          action: 'mfa_recovery_code_used',
          entityType: 'User',
          entityId: userId,
          changes: { remaining: after?.recoveryCodesHashed.length ?? 0 } as any,
        },
      });
      return 'recovery';
    }
    return null;
  }

  /** Are any of the user's active roles in this org subject to mandatory MFA? */
  async isMfaRequired(userId: string, organizationId: string): Promise<boolean> {
    const [org, userRoles] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { mfaRequiredRoles: true },
      }),
      this.prisma.userRole.findMany({
        where: { userId, organizationId },
        include: { role: true },
      }),
    ]);
    if (!org || org.mfaRequiredRoles.length === 0) return false;
    return userRoles.some((ur) => org.mfaRequiredRoles.includes(ur.role.name));
  }

  /** Regenerate recovery codes (e.g. when user runs out). Requires MFA enabled. */
  async regenerateRecoveryCodes(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.totpEnabled) throw new ConflictException('MFA is not enabled');
    const codes = this.generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { recoveryCodesHashed: codes.map((c) => sha256(c.replace(/[\s-]/g, ''))) },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorRole: 'self',
          action: 'mfa_recovery_codes_regenerated',
          entityType: 'User',
          entityId: userId,
          changes: { count: codes.length } as any,
        },
      }),
    ]);
    return { recoveryCodes: codes };
  }

  private generateRecoveryCodes(): string[] {
    const out: string[] = [];
    // Produce groups like "ABCD-EFGH" — 10 char alphanumeric, dash-formatted.
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused chars
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      const bytes = crypto.randomBytes(RECOVERY_CODE_LENGTH);
      let s = '';
      for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) s += ALPHA[bytes[j] % ALPHA.length];
      out.push(`${s.slice(0, 5)}-${s.slice(5)}`);
    }
    return out;
  }
}
