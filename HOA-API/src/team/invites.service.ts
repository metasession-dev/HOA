import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { CreateInviteDto, BulkInviteDto, RedeemInviteDto, SYSTEM_ROLE_NAMES } from './dto/team.dto';

export type Actor = { userId: string; role: string };

const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_LEN = 40;
const DEFAULT_TTL_DAYS = 14;

@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  async list(
    orgId: string,
    query: { status?: string; search?: string; bulkImportId?: string },
  ) {
    const where: Prisma.InviteWhereInput = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.bulkImportId) where.bulkImportId = query.bulkImportId;
    return this.prisma.invite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { customRole: { select: { id: true, name: true, displayName: true } } },
    });
  }

  async create(orgId: string, actor: Actor, dto: CreateInviteDto, bulkImportId?: string) {
    if (!dto.roleName && !dto.customRoleId) {
      throw new BadRequestException('Must specify either roleName or customRoleId');
    }
    if (dto.roleName && dto.customRoleId) {
      throw new BadRequestException('Specify only one of roleName or customRoleId');
    }

    // Normalise + cross-validate kind ↔ role. The UI has a separate "invite a
    // resident" form (with a People picker) vs "invite a team member" form
    // (with the admin-role dropdown). Crossing the streams — e.g. passing
    // kind='resident' with roleName='hoa_admin' — is rejected at this layer
    // so misuse of the API surfaces clearly instead of producing a malformed
    // invite that fails confusingly on redemption.
    const RESIDENT_ROLES = new Set(['owner', 'tenant']);
    const kind = dto.kind ?? 'team_member';
    if (kind === 'resident') {
      if (!dto.roleName || !RESIDENT_ROLES.has(dto.roleName)) {
        throw new BadRequestException('Resident invites must use roleName="owner" or "tenant"');
      }
      if (dto.customRoleId) {
        throw new BadRequestException('Resident invites cannot carry a custom role');
      }
    } else if (kind === 'team_member' && dto.roleName && RESIDENT_ROLES.has(dto.roleName)) {
      throw new BadRequestException(
        'Team member invites cannot carry resident roles — set kind="resident" instead',
      );
    } else if (kind === 'vendor') {
      if (dto.roleName !== 'vendor') {
        throw new BadRequestException('Vendor invites must use roleName="vendor"');
      }
      if (dto.customRoleId) {
        throw new BadRequestException('Vendor invites cannot carry a custom role');
      }
      if (!dto.vendorId) {
        throw new BadRequestException('Vendor invites require a vendorId');
      }
      const v = await this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, organizationId: orgId },
        select: { id: true, userId: true },
      });
      if (!v) throw new BadRequestException('Invalid vendorId for this organization');
      if (v.userId) throw new ConflictException('This vendor already has a portal login');
    } else if (dto.roleName === 'vendor') {
      throw new BadRequestException('The vendor role requires kind="vendor"');
    }

    // Validate personId if supplied: must belong to this org. For residents
    // we don't *require* a personId (admin might be inviting someone before
    // creating their Person record), but if given it must check out.
    let person: { id: string; email: string | null } | null = null;
    if (dto.personId) {
      person = await this.prisma.person.findFirst({
        where: { id: dto.personId, organizationId: orgId },
        select: { id: true, email: true },
      });
      if (!person) throw new BadRequestException('Invalid personId for this organization');
    }

    // Prevent privilege escalation: only existing admins can mint admin-level
    // invites. Property managers and other non-admin roles cannot invite admins.
    if (
      (dto.roleName === 'hoa_admin' || dto.roleName === 'super_admin') &&
      !['hoa_admin', 'super_admin'].includes(actor.role)
    ) {
      throw new ForbiddenException('Only an existing admin can invite users to admin roles');
    }
    if (dto.customRoleId) {
      const cr = await this.prisma.customRole.findFirst({
        where: { id: dto.customRoleId, organizationId: orgId, isActive: true },
      });
      if (!cr) throw new BadRequestException('Invalid custom role');
      // Permission subset: the actor must possess every permission they are
      // about to grant. This blocks non-admins from inviting users via a custom
      // role that exceeds their own capabilities. (See custom-roles.service for
      // the same check at CustomRole create/update time.)
      await this.assertActorCanGrantPermissions(orgId, actor, cr.permissions);
    }
    // Reject existing pending invite for this email in this org
    const existingPending = await this.prisma.invite.findFirst({
      where: { organizationId: orgId, email: dto.email.toLowerCase(), status: 'pending' },
    });
    if (existingPending) {
      throw new ConflictException('A pending invitation already exists for this email');
    }
    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);
    const ttl = new Date(Date.now() + DEFAULT_TTL_DAYS * 86400000);
    const invite = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invite.create({
        data: {
          organizationId: orgId,
          email: dto.email.toLowerCase(),
          firstName: dto.firstName,
          lastName: dto.lastName,
          roleName: dto.roleName,
          customRoleId: dto.customRoleId,
          kind,
          personId: dto.personId ?? null,
          vendorId: dto.vendorId ?? null,
          // Explicit choice OR derive from kind. Stored as the raw boolean
          // so a later "is the field set?" check at redeem-time can fall
          // back to the kind-based default without overriding an explicit
          // false (e.g. someone purposefully invited as resident-only).
          enterpriseAccess:
            dto.enterpriseAccess !== undefined
              ? dto.enterpriseAccess
              : kind === 'team_member',
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          unitIds: dto.unitIds ?? [],
          estateIds: dto.estateIds ?? [],
          approvalLimit: dto.approvalLimit !== undefined ? new Decimal(dto.approvalLimit) : null,
          // We store sha256(token). The raw token is returned once via the
          // controller response so the inviter can copy the link, and is never
          // persisted again.
          token: tokenHash,
          tokenExpiresAt: ttl,
          createdBy: actor.userId,
          bulkImportId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'invite_created',
          entityType: 'Invite',
          entityId: created.id,
          changes: { email: dto.email, roleName: dto.roleName, customRoleId: dto.customRoleId } as any,
        },
      });
      return created;
    });

    // Fire off the invitation email. Fire-and-forget — the MailService
    // queues the delivery and the inviter's create call still succeeds even
    // if the queue or template render fails. We always also return the raw
    // token so the admin can copy a link from the UI as a fallback.
    await this.sendInviteEmail({
      invite,
      rawToken,
      actorId: actor.userId,
      orgId,
      kind,
    });

    // Replace the persisted hash with the raw token in the response so the
    // caller (inviter) can copy the link. The raw token never goes back to the
    // database after this point.
    return { ...invite, token: rawToken };
  }

  /**
   * Render + enqueue the invitation email via Resend. Two flavours of copy
   * (resident vs team) are switched inside the template based on `kind`; the
   * redeem URL is constructed from APP_RESIDENTS_URL because that's where
   * both flows currently land (the residents app's `/invites/[token]` page
   * handles redemption for both, then the role-switcher routes the redeemed
   * user to the right app on first sign-in).
   *
   * All side-effects are wrapped in try/catch — email is informational only,
   * a queue / template / Resend hiccup must NOT fail the invite create call
   * (the admin still has the copy-to-clipboard fallback).
   */
  private async sendInviteEmail(args: {
    invite: { id: string; email: string; firstName: string | null; lastName: string | null; roleName: string | null; customRoleId: string | null; tokenExpiresAt: Date };
    rawToken: string;
    actorId: string;
    orgId: string;
    kind: 'team_member' | 'resident' | 'vendor';
    /** Bypass the EmailDelivery dedup index — used by resend to mint a new
     *  send after the token has been rotated. */
    force?: boolean;
  }) {
    try {
      const [org, inviter, customRole] = await Promise.all([
        this.prisma.organization.findUnique({
          where: { id: args.orgId },
          select: { name: true },
        }),
        this.prisma.user.findUnique({
          where: { id: args.actorId },
          select: { firstName: true, lastName: true, email: true },
        }),
        args.invite.customRoleId
          ? this.prisma.customRole.findUnique({
              where: { id: args.invite.customRoleId },
              select: { displayName: true },
            })
          : Promise.resolve(null),
      ]);

      const inviterName = inviter
        ? [inviter.firstName, inviter.lastName].filter(Boolean).join(' ').trim() ||
          inviter.email ||
          'Your administrator'
        : 'Your administrator';

      const roleDisplayName =
        customRole?.displayName ||
        args.invite.roleName?.replace(/_/g, ' ') ||
        (args.kind === 'resident' ? 'resident' : 'team member');

      // Single base URL for now — both kinds land on the residents PWA's
      // redeem page. Once a dedicated admin-side redeem page exists, switch
      // here on `args.kind` and route team invites to APP_ENTERPRISE_URL.
      const baseUrl =
        process.env.APP_RESIDENTS_URL ||
        process.env.RESIDENT_BASE_URL ||
        'http://localhost:3005';
      const redeemUrl = `${baseUrl.replace(/\/$/, '')}/invites/${args.rawToken}`;

      await this.mail.enqueue(
        {
          organizationId: args.orgId,
          templateKey: 'invite',
          to: args.invite.email,
          toName: [args.invite.firstName, args.invite.lastName].filter(Boolean).join(' ') || undefined,
          // Dedup on the invite id so an accidental double-call returns the
          // same EmailDelivery row instead of double-sending. Resend opts
          // into `force` to bypass this after token rotation.
          entityType: 'Invite',
          entityId: args.invite.id,
          replyTo: inviter?.email,
          data: {
            recipientFirstName: args.invite.firstName ?? '',
            organizationName: org?.name ?? 'your HOA',
            inviterName,
            roleDisplayName,
            redeemUrl,
            expiresAt: args.invite.tokenExpiresAt.toISOString(),
            kind: args.kind,
          },
        },
        { force: args.force },
      );
    } catch (err: any) {
      // Logged loudly but never bubbled — the invite row exists, the admin
      // has the link, and the missing email can be resent manually.
      // eslint-disable-next-line no-console
      console.warn(
        `[invites] Could not enqueue invitation email for ${args.invite.email}: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Bulk import: validates all rows first, then creates all invites in a single
   * transaction. Returns a per-row outcome list so the UI can show which rows
   * failed without losing the successful ones.
   */
  async bulkCreate(orgId: string, actor: Actor, dto: BulkInviteDto) {
    if (dto.invites.length === 0) throw new BadRequestException('No invites provided');
    if (dto.invites.length > 200) throw new BadRequestException('Bulk limited to 200 invites');

    const bulkImportId = crypto.randomBytes(12).toString('hex');
    const results: Array<{ row: number; email: string; ok: boolean; inviteId?: string; error?: string }> = [];

    // Per-row structural validation. The DTO accepts loose rows so one bad row
    // doesn't 400 the whole batch — surface it as a per-row error instead.
    const seenEmails = new Set<string>();
    for (let i = 0; i < dto.invites.length; i++) {
      const r = dto.invites[i];
      const rowNum = i + 1;
      const email = (r.email ?? '').trim().toLowerCase();

      if (!email) {
        results.push({ row: rowNum, email: '', ok: false, error: 'Missing email' });
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({ row: rowNum, email, ok: false, error: 'Invalid email format' });
        continue;
      }
      if (seenEmails.has(email)) {
        results.push({ row: rowNum, email, ok: false, error: 'Duplicate email in batch' });
        continue;
      }
      seenEmails.add(email);

      try {
        const invite = await this.create(orgId, actor, { ...r, email } as any, bulkImportId);
        results.push({ row: rowNum, email, ok: true, inviteId: invite.id });
      } catch (err: any) {
        results.push({ row: rowNum, email, ok: false, error: err.message });
      }
    }

    return {
      bulkImportId,
      total: dto.invites.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async revoke(id: string, orgId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findFirst({ where: { id, organizationId: orgId } });
      if (!invite) throw new NotFoundException('Invite not found');
      if (invite.status !== 'pending') {
        throw new ConflictException(`Cannot revoke invite in status ${invite.status}`);
      }
      const updated = await tx.invite.update({
        where: { id },
        data: { status: 'revoked', revokedAt: new Date(), revokedBy: actor.userId },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'invite_revoked',
          entityType: 'Invite',
          entityId: id,
          changes: { email: invite.email } as any,
        },
      });
      return updated;
    });
  }

  async resend(id: string, orgId: string, actor: Actor) {
    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);
    const ttl = new Date(Date.now() + DEFAULT_TTL_DAYS * 86400000);
    const updated = await this.prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findFirst({ where: { id, organizationId: orgId } });
      if (!invite) throw new NotFoundException('Invite not found');
      if (invite.status !== 'pending') {
        throw new ConflictException(`Cannot resend invite in status ${invite.status}`);
      }
      const u = await tx.invite.update({
        where: { id },
        data: { token: tokenHash, tokenExpiresAt: ttl },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'invite_resent',
          entityType: 'Invite',
          entityId: id,
          changes: { email: invite.email } as any,
        },
      });
      return u;
    });

    // Force-send a fresh invitation email with the rotated token. Without
    // `force: true` the MailService's dedup index would short-circuit since
    // an EmailDelivery row for this (org, template, entity, recipient) tuple
    // already exists from the original send.
    try {
      await this.sendInviteEmail({
        invite: updated,
        rawToken,
        actorId: actor.userId,
        orgId,
        kind: (updated.kind as 'team_member' | 'resident' | 'vendor') ?? 'team_member',
        force: true,
      });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn(`[invites] Resend email enqueue failed: ${err?.message ?? err}`);
    }

    return { ...updated, token: rawToken };
  }

  /** Public-token lookup used by the resident/admin redeem flow. No org auth. */
  async lookupByToken(rawToken: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token: this.hashToken(rawToken) },
      include: {
        organization: { select: { id: true, name: true, logoUrl: true } },
        customRole: { select: { id: true, name: true, displayName: true } },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') {
      throw new ForbiddenException(`This invitation has already been ${invite.status}`);
    }
    if (invite.tokenExpiresAt < new Date()) {
      // Auto-mark expired
      await this.prisma.invite.update({ where: { id: invite.id }, data: { status: 'expired' } });
      throw new ForbiddenException('Invitation has expired');
    }
    // Trim PII: do NOT return firstName/lastName publicly. They're optional in
    // the invite anyway and only used to pre-fill the redeem form — which is
    // OK to leave empty. Organization name + logo are public branding.
    return {
      email: invite.email,
      organization: invite.organization,
      roleName: invite.roleName,
      customRole: invite.customRole,
      expiresAt: invite.tokenExpiresAt,
    };
  }

  /** Redeem an invite: create user (or reuse existing), assign role, mark redeemed. */
  async redeem(dto: RedeemInviteDto, requestContext: { ip?: string; userAgent?: string }) {
    const tokenHash = this.hashToken(dto.token);
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { token: tokenHash } });
      if (!invite) throw new NotFoundException('Invite not found');
      if (invite.status !== 'pending') {
        throw new ForbiddenException(`Invitation already ${invite.status}`);
      }
      if (invite.tokenExpiresAt < new Date()) {
        await tx.invite.update({ where: { id: invite.id }, data: { status: 'expired' } });
        throw new ForbiddenException('Invitation has expired');
      }

      const existingUser = await tx.user.findUnique({ where: { email: invite.email } });

      // Cross-org takeover guard: never silently mutate an existing user via
      // a public, anonymous-redeem endpoint. If the email is already on the
      // platform, refuse the redeem and ask the admin to add the role directly
      // (an authenticated path through TeamService.assignRole). This protects:
      //   (a) a user being unwillingly attached to a new org
      //   (b) names being overwritten by an attacker
      //   (c) a deactivated account being silently reactivated
      if (existingUser) {
        throw new ForbiddenException(
          'An account already exists for this email. Ask your administrator to add this role to your existing account via Team → Assign role.',
        );
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const user = await tx.user.create({
        data: {
          email: invite.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          emailVerified: new Date(), // invitation = verified email
          // Propagate from the invite. Explicit value wins; absent → derive
          // from kind (team_member implies enterprise console access).
          enterpriseAccess:
            invite.enterpriseAccess !== null && invite.enterpriseAccess !== undefined
              ? invite.enterpriseAccess
              : invite.kind === 'team_member',
        },
      });

      // Resolve the role
      let roleId: string;
      if (invite.roleName) {
        const role = await tx.role.upsert({
          where: { name: invite.roleName },
          update: {},
          create: { name: invite.roleName, displayName: invite.roleName, permissions: [], isSystem: true },
        });
        roleId = role.id;
      } else if (invite.customRoleId) {
        // Custom-role assignments still need a base Role row for the existing
        // RBAC path. Default to 'tenant' so middleware decorators that look at
        // `user.role` see something sensible; the CustomRole.permissions[] is
        // the real authority for Phase 6 onwards.
        const fallback = await tx.role.upsert({
          where: { name: 'tenant' },
          update: {},
          create: { name: 'tenant', displayName: 'Tenant', permissions: [], isSystem: true },
        });
        roleId = fallback.id;
      } else {
        throw new ForbiddenException('Invite has no role assigned');
      }

      await tx.userRole.upsert({
        where: { userId_roleId_organizationId: { userId: user.id, roleId, organizationId: invite.organizationId } },
        update: {
          customRoleId: invite.customRoleId,
          expiresAt: invite.expiresAt,
          unitIds: invite.unitIds,
          estateIds: invite.estateIds,
          approvalLimit: invite.approvalLimit,
        },
        create: {
          userId: user.id,
          roleId,
          organizationId: invite.organizationId,
          customRoleId: invite.customRoleId,
          expiresAt: invite.expiresAt,
          unitIds: invite.unitIds,
          estateIds: invite.estateIds,
          approvalLimit: invite.approvalLimit,
          assignedBy: invite.createdBy,
        },
      });

      // Resident invite bound to a Person: wire the new User into that Person
      // so all their pre-existing data (occupancies → unit invoices, gate
      // passes, violations) is immediately visible to them on first login.
      // We only set userId if it's currently null — never silently overwrite
      // an existing link, which would be a takeover footgun.
      if (invite.kind === 'resident' && invite.personId) {
        const person = await tx.person.findUnique({
          where: { id: invite.personId },
          select: { id: true, organizationId: true, userId: true },
        });
        if (person && person.organizationId === invite.organizationId && !person.userId) {
          await tx.person.update({
            where: { id: person.id },
            data: { userId: user.id },
          });
        }
      }

      // Vendor invite: link the new login to its Vendor record so the vendor
      // portal resolves their profile + invoices. Never overwrite an existing
      // link (takeover guard).
      if (invite.kind === 'vendor' && invite.vendorId) {
        const vendor = await tx.vendor.findUnique({
          where: { id: invite.vendorId },
          select: { id: true, organizationId: true, userId: true },
        });
        if (vendor && vendor.organizationId === invite.organizationId && !vendor.userId) {
          await tx.vendor.update({
            where: { id: vendor.id },
            data: { userId: user.id },
          });
        }
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: { status: 'redeemed', redeemedAt: new Date(), redeemedUserId: user.id },
      });

      await tx.auditLog.create({
        data: {
          organizationId: invite.organizationId,
          actorId: user.id,
          // Audit attribution: the actor IS the new user (they performed the
          // redemption), but we record the inviter and a stable "invitee" role
          // label so forensics doesn't conflate the granted role with the
          // action role.
          actorRole: 'invitee',
          action: 'invite_redeemed',
          entityType: 'Invite',
          entityId: invite.id,
          changes: {
            email: invite.email,
            grantedRole: invite.roleName ?? null,
            grantedCustomRoleId: invite.customRoleId ?? null,
            invitedBy: invite.createdBy,
            ip: requestContext.ip,
          } as any,
        },
      });

      return { userId: user.id, organizationId: invite.organizationId, email: user.email };
    });
  }

  /**
   * Background job entry point — expire pending invites whose token has elapsed
   * AND deactivate role assignments whose expiresAt has passed.
   *
   * Called by cron (Phase 2.1 worker queue when it lands) but exposed as a
   * service method so it can be triggered manually from the admin team page or
   * a one-off test.
   */
  /**
   * Background job entry point. Triggered by an admin via /team/expiry-sweep,
   * or in Phase 2.1 by the cron worker. The actor is whoever called the
   * endpoint (we don't have a synthetic system user in this schema yet, and
   * AuditLog.actorId is a hard FK to User).
   */
  async runExpirySweep(actor?: Actor) {
    const now = new Date();
    const [expiredInvites, expiredRoles] = await this.prisma.$transaction([
      this.prisma.invite.updateMany({
        where: { status: 'pending', tokenExpiresAt: { lt: now } },
        data: { status: 'expired' },
      }),
      this.prisma.userRole.deleteMany({
        where: { expiresAt: { not: null, lt: now } },
      }),
    ]);

    if (actor && (expiredInvites.count > 0 || expiredRoles.count > 0)) {
      await this.prisma.auditLog.create({
        data: {
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'expiry_sweep',
          entityType: 'System',
          entityId: 'sweep',
          changes: { expiredInvites: expiredInvites.count, expiredRoles: expiredRoles.count } as any,
        },
      });
    }

    return { expiredInvites: expiredInvites.count, expiredRoles: expiredRoles.count };
  }

  private generateToken(): string {
    const bytes = crypto.randomBytes(TOKEN_LEN);
    let out = '';
    for (let i = 0; i < TOKEN_LEN; i++) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
    return out;
  }

  /** Sha256 hex digest used to store tokens at rest. */
  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Assert the actor can grant every requested permission. System admins are
   * always allowed. Other roles must already hold the permissions through one
   * of their CustomRoles. The fallback permission set for system roles is
   * pragmatic — we don't have a system→permission catalog yet; only true
   * `hoa_admin`/`super_admin` bypass.
   */
  private async assertActorCanGrantPermissions(orgId: string, actor: Actor, requested: string[]) {
    if (['hoa_admin', 'super_admin'].includes(actor.role)) return;
    const myAssignments = await this.prisma.userRole.findMany({
      where: { userId: actor.userId, organizationId: orgId },
      include: { customRole: true },
    });
    const myPerms = new Set<string>();
    for (const ur of myAssignments) {
      if (ur.customRole) {
        for (const p of ur.customRole.permissions) myPerms.add(p);
      }
    }
    const missing = requested.filter((p) => !myPerms.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Cannot grant permissions you do not hold: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? `, +${missing.length - 5} more` : ''}`,
      );
    }
  }
}
