import { Injectable, Logger, OnModuleInit, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import slugify from 'slugify';
import { PrismaService } from '../common/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { sha256 } from '../common/encryption';
import { MailService } from '../mail/mail.service';

const ENTERPRISE_URL = (
  process.env.APP_ENTERPRISE_URL || process.env.ENTERPRISE_BASE_URL || 'http://localhost:3005'
).replace(/\/$/, '');
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'dev@metasession.co';

// Short-lived in-memory store for MFA challenges keyed by sha256(challengeToken).
// Phase 9 swaps this for Redis. The same caveat as the public-resale rate
// limiter applies: per-process state will multiply across replicas.
const MFA_CHALLENGES = new Map<string, { userId: string; expiresAt: number; attempts: number }>();

/**
 * Privilege ordering — lowest number wins. When a user has multiple active
 * roles (e.g. exco_member + tenant), the primary role on login is the one
 * with the smallest rank here, so a board member logging in lands on the
 * admin app by default and can switch to the resident app via the topbar
 * dropdown if they want to do resident things. Anything not listed is
 * treated as the lowest priority.
 */
const ROLE_PRIORITY: Record<string, number> = {
  super_admin: 0,
  hoa_admin: 10,
  exco_chairperson: 20,
  exco_member: 25,
  property_manager: 30,
  finance_officer: 40,
  external_accountant: 45,
  communications_manager: 50,
  gate_security: 60,
  stakeholder: 70,
  vendor: 75,
  owner: 80,
  tenant: 90,
};
function pickPrimary<T extends { role: { name: string } }>(roles: T[]): T {
  return [...roles].sort(
    (a, b) =>
      (ROLE_PRIORITY[a.role.name] ?? 100) - (ROLE_PRIORITY[b.role.name] ?? 100),
  )[0];
}
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_MAX_ATTEMPTS = 5;

function pruneChallenges() {
  const now = Date.now();
  if (MFA_CHALLENGES.size < 5000) return;
  for (const [k, v] of MFA_CHALLENGES) if (v.expiresAt < now) MFA_CHALLENGES.delete(k);
}

// Roles that imply the user works on the admin side of the platform (not
// a resident-only owner/tenant). Used by the one-shot backfill to grant
// `enterpriseAccess` to existing users when this field was first added.
const ADMIN_SHAPED_ROLES = new Set([
  'super_admin', 'hoa_admin', 'property_manager',
  'exco_member', 'exco_chairperson',
  'finance_officer', 'external_accountant',
  'communications_manager', 'gate_security',
  'maintenance_coordinator', 'stakeholder',
]);

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mail: MailService,
  ) {}

  /**
   * One-shot backfill — when `User.enterpriseAccess` first lands, every
   * pre-existing user has it set to `false` by the column default. Any
   * user holding an admin-shaped role needs access to the console or
   * they'll be locked out of their own HOA, so we grant it here. Pure
   * idempotent SQL: only flips users currently at `false` who hold an
   * admin role. Subsequent boots are no-ops.
   */
  async onModuleInit() {
    try {
      const candidates = await this.prisma.user.findMany({
        where: { enterpriseAccess: false },
        include: {
          userRoles: { include: { role: { select: { name: true } } } },
        },
      });
      const toGrant = candidates.filter((u) =>
        u.userRoles.some((ur) => ADMIN_SHAPED_ROLES.has(ur.role.name)),
      );
      if (toGrant.length === 0) return;
      await this.prisma.user.updateMany({
        where: { id: { in: toGrant.map((u) => u.id) } },
        data: { enterpriseAccess: true },
      });
      this.logger.log(
        `Backfilled enterpriseAccess=true on ${toGrant.length} pre-existing admin user(s).`,
      );
    } catch (err: any) {
      // Don't crash boot — a migration hiccup shouldn't take the API down.
      this.logger.warn(
        `enterpriseAccess backfill skipped: ${err?.message ?? err}`,
      );
    }
  }

  static mfaChallenges() { return MFA_CHALLENGES; }
  static issueMfaChallenge(userId: string): string {
    pruneChallenges();
    const raw = crypto.randomBytes(32).toString('base64url');
    MFA_CHALLENGES.set(sha256(raw), { userId, expiresAt: Date.now() + MFA_CHALLENGE_TTL_MS, attempts: 0 });
    return raw;
  }

  /**
   * Look up the challenge owner without consuming it. Use this on bad-code
   * paths so a typo doesn't force the user back to password login. Returns
   * { userId, attemptsLeft } or null if expired/missing/exhausted.
   */
  static peekMfaChallenge(raw: string): { userId: string; attemptsLeft: number } | null {
    const key = sha256(raw);
    const ch = MFA_CHALLENGES.get(key);
    if (!ch) return null;
    if (ch.expiresAt < Date.now()) {
      MFA_CHALLENGES.delete(key);
      return null;
    }
    return { userId: ch.userId, attemptsLeft: Math.max(0, MFA_MAX_ATTEMPTS - ch.attempts) };
  }

  /** Mark a failed attempt; burn the challenge after MFA_MAX_ATTEMPTS tries. */
  static recordMfaFailure(raw: string): { attemptsLeft: number; burned: boolean } {
    const key = sha256(raw);
    const ch = MFA_CHALLENGES.get(key);
    if (!ch) return { attemptsLeft: 0, burned: true };
    ch.attempts++;
    if (ch.attempts >= MFA_MAX_ATTEMPTS) {
      MFA_CHALLENGES.delete(key);
      return { attemptsLeft: 0, burned: true };
    }
    return { attemptsLeft: MFA_MAX_ATTEMPTS - ch.attempts, burned: false };
  }

  /** Consume on success — removes the challenge so it can't be reused. */
  static consumeMfaChallenge(raw: string): string | null {
    const key = sha256(raw);
    const ch = MFA_CHALLENGES.get(key);
    if (!ch) return null;
    if (ch.expiresAt < Date.now()) {
      MFA_CHALLENGES.delete(key);
      return null;
    }
    MFA_CHALLENGES.delete(key);
    return ch.userId;
  }

  async login(dto: LoginDto, requestContext: { ip?: string; userAgent?: string } = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        userRoles: {
          include: { role: true, organization: true },
        },
      },
    });

    const recordLogin = async (
      outcome: 'success' | 'failed',
      failureReason?: string,
      userIdOverride?: string,
      orgIdOverride?: string,
    ) => {
      const userId = userIdOverride ?? user?.id;
      if (!userId) return; // can't FK without a user
      try {
        await this.prisma.loginHistory.create({
          data: {
            userId,
            organizationId: orgIdOverride ?? user?.userRoles[0]?.organizationId,
            outcome,
            failureReason,
            ipAddress: requestContext.ip?.slice(0, 64),
            userAgent: requestContext.userAgent?.slice(0, 500),
          },
        });
      } catch {
        // Best-effort: never let login-history logging block the auth response
      }
    };

    if (!user || !user.isActive) {
      await recordLogin('failed', !user ? 'user_not_found' : 'user_inactive');
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await recordLogin('failed', 'bad_password');
      throw new UnauthorizedException('Invalid credentials');
    }

    // Filter out time-bound role assignments that have expired
    const now = new Date();
    const activeRoles = user.userRoles.filter((ur) => !ur.expiresAt || ur.expiresAt > now);
    if (activeRoles.length === 0) {
      await recordLogin('failed', 'no_active_roles');
      throw new UnauthorizedException('No active roles for this user');
    }

    // App-origin gate. When the caller is HOA-ENTERPRISE the user MUST
    // hold `enterpriseAccess` — even valid credentials are refused without
    // it. This blocks a resident (whose Person.userId got bound by an
    // invite redeem) from typing the admin URL and signing in to the
    // console.
    //
    // Self-healing back-fill: when `enterpriseAccess` was first added the
    // column defaulted to `false` for every pre-existing user. The
    // OnModuleInit hook tries to back-fill admin-shaped roles on boot,
    // but in practice it can race / silently fail (Prisma not yet
    // generated, dev server didn't restart cleanly, etc.). So we also
    // check the same condition here: if the user lacks the flag but
    // holds an admin-shaped role, flip it inline and continue. This
    // turns the first admin login post-release into a self-fix instead
    // of a lockout.
    //
    // Skip when `app` is omitted to keep CLI / integration callers
    // working unchanged.
    if (dto.app === 'enterprise' && !user.enterpriseAccess) {
      const hasAdminRole = activeRoles.some((ur) =>
        ADMIN_SHAPED_ROLES.has(ur.role.name),
      );
      if (hasAdminRole) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { enterpriseAccess: true },
        });
        user.enterpriseAccess = true;
        this.logger.log(
          `Granted enterpriseAccess inline for ${user.email} (admin-shaped role detected).`,
        );
      } else {
        await recordLogin('failed', 'enterprise_access_denied');
        throw new ForbiddenException(
          'Your account doesn\'t have access to the admin console. Ask your HOA admin to grant you enterprise access, or sign in to the resident portal instead.',
        );
      }
    }

    // Highest-privilege role first so e.g. an exco_member-who-is-also-a-tenant
    // lands on the admin app by default. They can flip to the resident view
    // via the topbar role switcher if they want.
    const primaryRole = pickPrimary(activeRoles);

    // MFA gate: if MFA is enabled for this user, OR mandatory for any of the
    // user's active roles in their primary org, short-circuit here. The client
    // gets a one-time mfaChallengeToken and must POST it + a 6-digit code to
    // /api/auth/mfa/verify to receive the session tokens.
    const mfaMandatory = await this.mfaRequiredForUser(user.id, activeRoles);
    if (user.totpEnabled || mfaMandatory) {
      if (!user.totpEnabled && mfaMandatory) {
        await recordLogin('failed', 'mfa_required_but_not_enrolled');
        throw new ForbiddenException(
          'MFA enrollment is required for your role. Contact your administrator to receive a temporary enrollment access.',
        );
      }
      await recordLogin('mfa_required' as any, 'mfa_challenge_issued');
      const mfaChallengeToken = AuthService.issueMfaChallenge(user.id);
      return {
        mfaRequired: true,
        mfaChallengeToken,
        // Echo basic profile so the client can render "signing in as ..." UX.
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      } as any;
    }

    // Update last-login + record successful login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now, lastLoginIp: requestContext.ip?.slice(0, 64) },
    });
    await recordLogin('success');

    const token = this.generateToken(user, primaryRole);

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: activeRoles.map((ur) => ({
          role: ur.role.name,
          roleName: ur.role.displayName,
          organizationId: ur.organizationId,
          organizationName: ur.organization.name,
        })),
      },
    };
  }

  /**
   * Complete a login after MFA was satisfied (or magic-link was redeemed).
   * Returns the same shape as a no-MFA login: accessToken + user profile.
   * Refresh-token rotation is handled by SessionsService callers.
   */
  async completeSessionForUser(userId: string, requestContext: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true, organization: true } } },
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    const now = new Date();
    const activeRoles = user.userRoles.filter((ur) => !ur.expiresAt || ur.expiresAt > now);
    if (activeRoles.length === 0) throw new UnauthorizedException('No active roles for this user');
    // Highest-privilege role first so e.g. an exco_member-who-is-also-a-tenant
    // lands on the admin app by default. They can flip to the resident view
    // via the topbar role switcher if they want.
    const primaryRole = pickPrimary(activeRoles);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now, lastLoginIp: requestContext.ip?.slice(0, 64) },
    });
    try {
      await this.prisma.loginHistory.create({
        data: {
          userId: user.id,
          organizationId: primaryRole.organizationId,
          outcome: 'success',
          failureReason: 'mfa_verified',
          ipAddress: requestContext.ip?.slice(0, 64),
          userAgent: requestContext.userAgent?.slice(0, 500),
        },
      });
    } catch { /* best-effort */ }

    const token = this.generateToken(user, primaryRole);
    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: activeRoles.map((ur) => ({
          role: ur.role.name,
          roleName: ur.role.displayName,
          organizationId: ur.organizationId,
          organizationName: ur.organization.name,
        })),
      },
      primaryRole: { name: primaryRole.role.name, organizationId: primaryRole.organizationId },
    };
  }

  /** Does this user need MFA based on their roles' MFA-required policy? */
  async mfaRequiredForUser(
    userId: string,
    activeRoles: Array<{ role: { name: string }; organizationId: string }>,
  ): Promise<boolean> {
    const orgIds = Array.from(new Set(activeRoles.map((r) => r.organizationId)));
    if (orgIds.length === 0) return false;
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, mfaRequiredRoles: true },
    });
    for (const org of orgs) {
      if (!org.mfaRequiredRoles || org.mfaRequiredRoles.length === 0) continue;
      const hasRequiredRoleInOrg = activeRoles.some(
        (r) => r.organizationId === org.id && org.mfaRequiredRoles.includes(r.role.name),
      );
      if (hasRequiredRoleInOrg) return true;
    }
    return false;
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    let slug = slugify(dto.organizationName, { lower: true, strict: true });

    const existingOrg = await this.prisma.organization.findUnique({
      where: { slug },
    });
    if (existingOrg) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          emailVerified: new Date(),
          // The first user registering a new HOA is always an admin — they
          // need access to the enterprise console by definition.
          enterpriseAccess: true,
        },
      });

      const org = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
          country: dto.country || 'ZA',
          currency: dto.currency || 'ZAR',
        },
      });

      let adminRole = await tx.role.findUnique({
        where: { name: 'hoa_admin' },
      });
      if (!adminRole) {
        adminRole = await tx.role.create({
          data: {
            name: 'hoa_admin',
            displayName: 'HOA Admin',
            permissions: ['*'],
            isSystem: true,
          },
        });
      }

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: adminRole.id,
          organizationId: org.id,
        },
      });

      // Seed GL accounts for the new org
      const accounts = [
        { code: '4000', name: 'Levy Income', type: 'income' },
        { code: '4010', name: 'Special Levy Income', type: 'income' },
        { code: '4020', name: 'Interest on Late Payments', type: 'income' },
        { code: '5000', name: 'Security Services', type: 'expense' },
        { code: '5010', name: 'Landscaping & Gardening', type: 'expense' },
        { code: '5020', name: 'Maintenance & Repairs', type: 'expense' },
        { code: '5030', name: 'Utilities - Electricity', type: 'expense' },
        { code: '5040', name: 'Utilities - Water', type: 'expense' },
        { code: '5050', name: 'Insurance', type: 'expense' },
        { code: '5060', name: 'Management Fees', type: 'expense' },
        { code: '5090', name: 'Bank Charges', type: 'expense' },
        { code: '1000', name: 'Bank - Operating Account', type: 'asset' },
        { code: '1010', name: 'Bank - Reserve Account', type: 'asset' },
        { code: '1020', name: 'Accounts Receivable - Levies', type: 'asset' },
        { code: '2000', name: 'Accounts Payable', type: 'liability' },
        { code: '2010', name: 'Deferred Income', type: 'liability' },
        { code: '3000', name: 'Accumulated Surplus', type: 'equity' },
      ];

      for (const acct of accounts) {
        await tx.gLAccount.create({
          data: { organizationId: org.id, ...acct, isSystem: true },
        });
      }

      // Seed default approval rules per PRD §6.1.5
      // <R5k: finance_officer · R5k–R50k: exco_member · >R50k: exco_chairperson
      await tx.approvalRule.createMany({
        data: [
          {
            organizationId: org.id,
            name: 'Routine payment (< R5 000)',
            minAmount: null,
            maxAmount: 5000,
            currency: 'ZAR',
            requiredRoles: ['finance_officer', 'hoa_admin'],
            approverCount: 1,
            mode: 'any',
            priority: 10,
          },
          {
            organizationId: org.id,
            name: 'Standard payment (R5 000 – R50 000)',
            minAmount: 5000,
            maxAmount: 50000,
            currency: 'ZAR',
            requiredRoles: ['exco_member', 'exco_chairperson', 'hoa_admin'],
            approverCount: 1,
            mode: 'any',
            priority: 20,
          },
          {
            organizationId: org.id,
            name: 'High-value payment (> R50 000)',
            minAmount: 50000,
            maxAmount: null,
            currency: 'ZAR',
            requiredRoles: ['exco_chairperson', 'hoa_admin'],
            approverCount: 1,
            mode: 'any',
            priority: 30,
          },
        ],
      });

      return { user, org };
    });

    // Seed default request categories so the resident PWA's "New request"
    // dropdown is populated from day one without an admin having to remember
    // to create them. Outside the org-creation transaction so a seed hiccup
    // doesn't roll back account creation — the listCategories endpoint is
    // self-healing anyway.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ensureDefaultRequestCategories } = require('../requests/requests.service');
      await ensureDefaultRequestCategories(this.prisma, result.org.id);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn(`[register] could not seed default request categories: ${err?.message ?? err}`);
    }

    // Welcome email — best-effort, never blocks sign-up. Deduped per org so a
    // retried register can't double-send.
    try {
      await this.mail.enqueue({
        organizationId: result.org.id,
        templateKey: 'welcome',
        to: result.user.email,
        toName: `${result.user.firstName ?? ''} ${result.user.lastName ?? ''}`.trim() || undefined,
        toUserId: result.user.id,
        entityType: 'Organization',
        entityId: result.org.id,
        data: {
          recipientFirstName: result.user.firstName || 'there',
          organizationName: result.org.name,
          dashboardUrl: ENTERPRISE_URL,
          supportEmail: SUPPORT_EMAIL,
        },
      });
    } catch (err: any) {
      this.logger.warn(`[register] welcome email failed: ${err?.message ?? err}`);
    }

    const token = this.generateToken(result.user, {
      role: { name: 'hoa_admin' },
      organizationId: result.org.id,
    });

    return {
      accessToken: token,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        roles: [
          {
            role: 'hoa_admin',
            roleName: 'HOA Admin',
            organizationId: result.org.id,
            organizationName: result.org.name,
          },
        ],
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: { role: true, organization: true },
        },
      },
    });

    if (!user) throw new UnauthorizedException();

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      roles: user.userRoles.map((ur) => ({
        role: ur.role.name,
        roleName: ur.role.displayName,
        organizationId: ur.organizationId,
        organizationName: ur.organization.name,
      })),
    };
  }

  private generateToken(user: any, roleAssignment: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: roleAssignment?.role?.name || 'owner',
      organizationId: roleAssignment?.organizationId || null,
    };
    return this.jwtService.sign(payload);
  }

  /**
   * Issue a fresh JWT for a different role the same user already holds.
   * Used by the topbar role switcher when an exco who is also a tenant
   * wants to flip into the resident PWA (and vice versa). The new JWT
   * replaces the old one on the client; nothing else changes about the
   * user record.
   *
   * Security:
   *   - The caller must currently be authenticated (controller enforces).
   *   - We re-load userRoles from the DB so a role revoked since login
   *     can't be re-acquired via switch.
   *   - Expired UserRole assignments are filtered out.
   *   - If the requested (role, organizationId) doesn't match an active
   *     assignment, we throw 403 — never silently fall back to another
   *     role, because that would be a privilege-escalation footgun.
   */
  async switchRole(
    userId: string,
    targetRole: string,
    targetOrganizationId?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true, organization: true } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Account not available');

    const now = new Date();
    const activeRoles = user.userRoles.filter((ur) => !ur.expiresAt || ur.expiresAt > now);
    const match = activeRoles.find(
      (ur) =>
        ur.role.name === targetRole &&
        (!targetOrganizationId || ur.organizationId === targetOrganizationId),
    );
    if (!match) {
      throw new ForbiddenException(
        `You do not have an active "${targetRole}" assignment on this account`,
      );
    }

    const token = this.generateToken(user, match);

    // Audit the swap — useful when investigating "why did this user have
    // exco access at 03:00?" later. Best-effort: don't fail the swap if
    // the audit row can't be written.
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: match.organizationId,
          actorId: user.id,
          actorRole: match.role.name,
          action: 'role_switched',
          entityType: 'User',
          entityId: user.id,
          changes: { to: match.role.name, orgId: match.organizationId } as any,
        },
      });
    } catch { /* non-fatal */ }

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: activeRoles.map((ur) => ({
          role: ur.role.name,
          roleName: ur.role.displayName,
          organizationId: ur.organizationId,
          organizationName: ur.organization.name,
        })),
      },
      primaryRole: { name: match.role.name, organizationId: match.organizationId },
    };
  }
}
