import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { sha256, stableStringify } from '../common/encryption';

export type Actor = { userId: string; role: string; organizationId?: string };
export type RequestCtx = { ip?: string; userAgent?: string };

const ERASURE_WAITING_DAYS = 30;
const EXPORT_TTL_DAYS = 30;

/**
 * Phase 8.3 POPIA / GDPR controls.
 *
 * Three subject-rights flows:
 *   - export: package every record linked to the user into a JSON bundle the
 *     user can download. Today we generate the JSON inline and persist a
 *     placeholder fileUrl (R2 lands in Phase 1.5). The bundle is signed via
 *     sha256 so any later tamper is detectable.
 *   - erasure: 30-day waiting window before destructive anonymization;
 *     non-PII rows (audit log, financial entries) are preserved; identifying
 *     fields (name, email, phone) are replaced with deterministic redactions.
 *   - consent: log every consent grant/withdrawal with IP + UA for the
 *     POPIA evidentiary record.
 *
 * Note on erasure scope: when `organizationId` is set on the request, we only
 * anonymize that org's slice (the user remains in other orgs). When null,
 * we anonymize the user globally and clear their authentication credentials
 * (passwordHash, TOTP) so they can no longer log in.
 */
@Injectable()
export class PrivacyService {
  constructor(private prisma: PrismaService) {}

  // ============== EXPORT ==============

  /** Kick off an export request for the actor (or, when admin, for any user). */
  async requestExport(targetUserId: string, actor: Actor, orgId?: string) {
    if (targetUserId !== actor.userId && !this.isAdmin(actor)) {
      throw new ForbiddenException('Only admins can export another user\'s data');
    }
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw new NotFoundException('User not found');

    // Review #4: when an admin requests on behalf of another user, the admin
    // must share at least one organization with that user (and `orgId`, if
    // provided, must match the admin's current org). super_admin can act
    // cross-org.
    if (targetUserId !== actor.userId && actor.role !== 'super_admin') {
      const adminOrgId = actor.organizationId;
      if (!adminOrgId) throw new ForbiddenException('Admin has no organization context');
      if (orgId && orgId !== adminOrgId) {
        throw new ForbiddenException('Cannot export for an organization you do not belong to');
      }
      const sharesOrg = await this.prisma.userRole.findFirst({
        where: { userId: targetUserId, organizationId: adminOrgId },
      });
      if (!sharesOrg) throw new ForbiddenException('Target user is not in your organization');
    }

    const req = await this.prisma.$transaction(async (tx) => {
      const r = await tx.dataExportRequest.create({
        data: {
          userId: targetUserId,
          organizationId: orgId,
          status: 'pending',
          expiresAt: new Date(Date.now() + EXPORT_TTL_DAYS * 86400000),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'data_export_requested',
          entityType: 'DataExportRequest',
          entityId: r.id,
          changes: { targetUserId, orgScoped: !!orgId } as any,
        },
      });
      return r;
    });
    // Execute synchronously in dev. In Phase 2.1 this hands off to a worker.
    this.executeExport(req.id).catch((err) => {
      // Best-effort: mark failed if it crashes
      this.prisma.dataExportRequest.update({
        where: { id: req.id },
        data: { status: 'failed', errorMessage: err.message },
      }).catch(() => {});
    });
    return req;
  }

  async listExports(actor: Actor) {
    return this.prisma.dataExportRequest.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getExport(id: string, actor: Actor) {
    const r = await this.prisma.dataExportRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Export not found');
    if (r.userId !== actor.userId) {
      // Review #3: admins can only read exports scoped to their own org. Global
      // exports (organizationId = null) are super_admin only.
      if (actor.role === 'super_admin') return r;
      if (!this.isAdmin(actor)) throw new ForbiddenException('Cannot read another user\'s export');
      if (!r.organizationId || r.organizationId !== actor.organizationId) {
        throw new ForbiddenException('Export is outside your organization');
      }
    }
    return r;
  }

  /**
   * Produce the actual export. Today returns the bundle inline so it can be
   * downloaded; when Phase 1.5 (R2) lands we'll write the file to storage
   * and set `fileUrl`.
   */
  async downloadExport(id: string, actor: Actor) {
    const r = await this.getExport(id, actor);
    if (r.status !== 'ready') throw new ConflictException(`Export is ${r.status}; cannot download`);
    if (r.expiresAt && r.expiresAt < new Date()) {
      throw new ConflictException('Export has expired');
    }
    // Review #10: regenerate the bundle on each download (so it reflects the
    // user's current data), AND recompute the SHA256 over the new bytes so
    // the signature actually matches what they're downloading. The original
    // `r.sha256` is preserved as `originalSignature` for audit, but the
    // currently-shipped bytes are signed fresh.
    const bundle = await this.collectUserData(r.userId, r.organizationId ?? undefined);
    const json = stableStringify(bundle);
    const signature = sha256(json);
    return {
      bundle,
      signature,
      originalSignature: r.sha256,
      signatureMatchesOriginal: signature === r.sha256,
      generatedAt: new Date().toISOString(),
    };
  }

  private async executeExport(requestId: string) {
    const req = await this.prisma.dataExportRequest.findUniqueOrThrow({ where: { id: requestId } });
    const bundle = await this.collectUserData(req.userId, req.organizationId ?? undefined);
    const bundleJson = stableStringify(bundle);
    const hash = sha256(bundleJson);
    await this.prisma.dataExportRequest.update({
      where: { id: requestId },
      data: {
        status: 'ready',
        completedAt: new Date(),
        fileUrl: `mock://exports/${requestId}.json`,
        fileSize: Buffer.byteLength(bundleJson, 'utf8'),
        sha256: hash,
      },
    });
  }

  /**
   * Walk every model that references the user and assemble a structured
   * bundle. We strip secrets (password hashes, TOTP secrets, raw tokens)
   * before returning.
   */
  private async collectUserData(userId: string, orgScope?: string) {
    const orgFilter = orgScope ? { organizationId: orgScope } : {};
    const personFilter = orgScope ? { organizationId: orgScope } : {};
    const orFilter: any[] = [{ organizationId: orgScope ?? undefined }];

    const [
      user, userRoles, persons, loginHistory, consents,
      conversations, messages, invitesSent, customRolesCreated,
      sessionsCount,
    ] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true, email: true, firstName: true, lastName: true, phone: true,
          avatarUrl: true, isActive: true, emailVerified: true,
          createdAt: true, updatedAt: true,
          lastLoginAt: true, lastLoginIp: true, totpEnabled: true, totpEnabledAt: true,
        },
      }),
      // Review #6: every collection is capped so an attacker can't OOM the
      // API by inflating their own history (e.g. spamming assistant messages,
      // generating thousands of invites) and then requesting an export.
      this.prisma.userRole.findMany({
        where: { userId, ...orgFilter },
        include: { role: { select: { name: true, displayName: true } }, organization: { select: { name: true } } },
        take: 200,
      }),
      this.prisma.person.findMany({ where: { userId, ...personFilter }, take: 200 }),
      this.prisma.loginHistory.findMany({
        where: { userId, ...orgFilter },
        orderBy: { occurredAt: 'desc' }, take: 500,
      }),
      this.prisma.consentRecord.findMany({
        where: { userId, ...orgFilter },
        orderBy: { occurredAt: 'desc' },
        take: 1000,
      }),
      this.prisma.assistantConversation.findMany({
        where: { userId, ...orgFilter },
        select: { id: true, title: true, createdAt: true, archivedAt: true },
        take: 500,
      }),
      this.prisma.assistantMessage.findMany({
        where: { conversation: { userId, ...orgFilter } },
        select: { id: true, conversationId: true, role: true, content: true, intentSlug: true, createdAt: true },
        take: 5000,
      }),
      this.prisma.invite.findMany({
        where: { createdBy: userId, ...orgFilter },
        select: { id: true, email: true, status: true, createdAt: true },
        take: 1000,
      }),
      this.prisma.customRole.findMany({
        where: { createdBy: userId, ...orgFilter },
        select: { id: true, name: true, displayName: true, createdAt: true },
        take: 200,
      }),
      this.prisma.session.count({ where: { userId } }),
    ]);

    // Resident-facing financial records: invoices + payments tied to units
    // they currently or previously occupied (via Person).
    const personIds = persons.map((p) => p.id);
    const occupancies = personIds.length > 0
      ? await this.prisma.unitOccupancy.findMany({
          where: { personId: { in: personIds } },
          include: { unit: { select: { id: true, unitNumber: true, estate: { select: { name: true } } } } },
          take: 500,
        })
      : [];
    const unitIds = occupancies.map((o) => o.unitId);
    const [invoices, payments] = unitIds.length > 0
      ? await Promise.all([
          this.prisma.invoice.findMany({
            where: { unitId: { in: unitIds }, ...orgFilter },
            select: { id: true, invoiceNumber: true, amount: true, currency: true, status: true, dueDate: true, createdAt: true, paidAt: true },
            orderBy: { createdAt: 'desc' },
            take: 5000,
          }),
          this.prisma.payment.findMany({
            where: { invoice: { unitId: { in: unitIds }, ...orgFilter } },
            select: { id: true, invoiceId: true, amount: true, currency: true, method: true, status: true, processedAt: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 5000,
          }),
        ])
      : [[], []];

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      scope: orgScope ? { organizationId: orgScope } : { allOrganizations: true },
      profile: user,
      userRoles,
      persons,
      occupancies,
      loginHistory: loginHistory.map((l) => ({
        id: l.id, outcome: l.outcome, occurredAt: l.occurredAt,
        ipAddress: l.ipAddress, userAgent: l.userAgent, failureReason: l.failureReason,
      })),
      consents,
      assistantConversations: conversations,
      assistantMessages: messages,
      invitesSent,
      customRolesCreated,
      financial: { invoices, payments },
      sessions: { activeCount: sessionsCount }, // detail withheld for security
    };
  }

  // ============== ERASURE ==============

  /**
   * Submit a Right-to-be-Forgotten request. A 30-day waiting window applies
   * before destructive anonymization runs. The user can cancel; an admin can
   * reject (with reason).
   */
  async submitErasure(targetUserId: string, actor: Actor, dto: { reason?: string; organizationId?: string }) {
    if (targetUserId !== actor.userId && !this.isAdmin(actor)) {
      throw new ForbiddenException('Only admins can request erasure for another user');
    }
    // Review #2: when scoping to an org, the target user must actually belong
    // to it (otherwise unrelated admins could spam approval queues / pollute
    // audit log). Global scope is allowed for self; admins go through a
    // specific org or super_admin.
    if (dto.organizationId) {
      const membership = await this.prisma.userRole.findFirst({
        where: { userId: targetUserId, organizationId: dto.organizationId },
      });
      if (!membership) {
        throw new BadRequestException('Target user is not a member of that organization');
      }
      // Non-super admins acting on behalf of another user must also share the org.
      if (targetUserId !== actor.userId && actor.role !== 'super_admin') {
        if (actor.organizationId !== dto.organizationId) {
          throw new ForbiddenException('Cannot submit erasure for an organization you do not belong to');
        }
      }
    } else {
      // Global scope (organizationId omitted) — only the user themself OR
      // super_admin may submit; an org admin can't trigger global erasure
      // for a resident outside their authority.
      if (targetUserId !== actor.userId && actor.role !== 'super_admin') {
        throw new ForbiddenException('Only super_admin can submit a global erasure for another user');
      }
    }
    // Prevent stacking: a single open request per (user, org).
    const existing = await this.prisma.erasureRequest.findFirst({
      where: { userId: targetUserId, organizationId: dto.organizationId ?? null, status: { in: ['submitted', 'reviewing', 'approved'] } },
    });
    if (existing) {
      throw new ConflictException('There is already an open erasure request for this scope');
    }
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.erasureRequest.create({
        data: {
          userId: targetUserId,
          organizationId: dto.organizationId,
          status: 'submitted',
          reason: dto.reason,
          scheduledFor: new Date(Date.now() + ERASURE_WAITING_DAYS * 86400000),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: dto.organizationId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'erasure_requested',
          entityType: 'ErasureRequest',
          entityId: r.id,
          changes: { targetUserId, reason: dto.reason } as any,
        },
      });
      return r;
    });
  }

  async listErasure(actor: Actor) {
    return this.prisma.erasureRequest.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async cancelErasure(id: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.erasureRequest.findFirst({ where: { id, userId: actor.userId } });
      if (!r) throw new NotFoundException('Erasure request not found');
      if (!['submitted', 'reviewing', 'approved'].includes(r.status)) {
        throw new ConflictException(`Cannot cancel a ${r.status} request`);
      }
      // Review #12: once the waiting window has elapsed, an approved request
      // can be picked up by execute concurrently. Cancelling at that point is
      // racy and the user's expectation of "still time to back out" is wrong.
      // Block at the boundary and route them to support.
      if (r.status === 'approved' && r.scheduledFor < new Date()) {
        throw new ConflictException('Waiting window has elapsed — contact support to halt execution');
      }
      // CAS: only flip if the status didn't move under us.
      const claim = await tx.erasureRequest.updateMany({
        where: { id, status: r.status },
        data: { status: 'cancelled' },
      });
      if (claim.count === 0) {
        throw new ConflictException('Erasure request was modified concurrently');
      }
      const u = await tx.erasureRequest.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: {
          organizationId: r.organizationId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'erasure_cancelled',
          entityType: 'ErasureRequest',
          entityId: id,
          changes: {} as any,
        },
      });
      return u;
    });
  }

  /**
   * Admin-side moderation: approve or reject the request. Approval doesn't
   * execute immediately — execution waits for `scheduledFor`.
   */
  async moderateErasure(id: string, actor: Actor, action: 'approved' | 'rejected', reason?: string) {
    if (!this.isAdmin(actor)) throw new ForbiddenException('Only admins can moderate erasure');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.erasureRequest.findUnique({ where: { id } });
      if (!r) throw new NotFoundException('Erasure request not found');
      // Review #1: org-scoped requests must be moderated by an admin from that
      // org. Global-scope (no org) requests require super_admin.
      if (actor.role !== 'super_admin') {
        if (!r.organizationId) {
          throw new ForbiddenException('Global erasure requests can only be moderated by super_admin');
        }
        if (r.organizationId !== actor.organizationId) {
          throw new ForbiddenException('Cannot moderate an erasure request outside your organization');
        }
      }
      if (r.status !== 'submitted' && r.status !== 'reviewing') {
        throw new ConflictException(`Cannot ${action} a ${r.status} request`);
      }
      const u = await tx.erasureRequest.update({
        where: { id },
        data: {
          status: action,
          reviewedBy: actor.userId,
          rejectedReason: action === 'rejected' ? reason : null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: r.organizationId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: action === 'approved' ? 'erasure_approved' : 'erasure_rejected',
          entityType: 'ErasureRequest',
          entityId: id,
          changes: { reason } as any,
        },
      });
      return u;
    });
  }

  /**
   * Execute an approved erasure that has passed its waiting window. Runs the
   * destructive anonymization in a transaction; audit rows are preserved
   * (the `actor` field FK still references the User, but we replace name/
   * email/phone with deterministic redactions so subpoenaed audit logs no
   * longer carry direct identifiers).
   */
  async executeErasure(id: string, actor: Actor) {
    if (!this.isAdmin(actor)) throw new ForbiddenException('Only admins can execute erasure');
    const req = await this.prisma.erasureRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Erasure request not found');
    if (req.status !== 'approved') throw new ConflictException('Request must be approved before execution');
    if (req.scheduledFor > new Date()) {
      throw new ConflictException(`30-day waiting window has not elapsed (scheduled ${req.scheduledFor.toISOString()})`);
    }
    // Review #1: same org check as moderate.
    if (actor.role !== 'super_admin') {
      if (!req.organizationId) {
        throw new ForbiddenException('Global erasure requests can only be executed by super_admin');
      }
      if (req.organizationId !== actor.organizationId) {
        throw new ForbiddenException('Cannot execute an erasure request outside your organization');
      }
    }
    return this.anonymizeUserScoped(req.userId, req.organizationId ?? null, actor, id);
  }

  private async anonymizeUserScoped(userId: string, orgId: string | null, actor: Actor, requestId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Review #5: atomic CAS on the request status. If another transaction
      // beat us (concurrent execute, or a cancel), this update affects 0 rows
      // and we abort. Avoids double-anonymization.
      const claim = await tx.erasureRequest.updateMany({
        where: { id: requestId, status: 'approved' },
        data: { status: 'completed', completedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new ConflictException('Erasure request was modified or already executed');
      }
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      // Deterministic redaction values so the audit log remains queryable
      // (the same erased user shows up consistently) without re-identifying.
      const redact = `erased-${sha256(userId).slice(0, 8)}`;
      const redactedEmail = `${redact}@erased.invalid`;

      if (!orgId) {
        // Global erasure: wipe credentials + identifiers everywhere.
        await tx.user.update({
          where: { id: userId },
          data: {
            email: redactedEmail,
            firstName: 'Erased',
            lastName: 'User',
            phone: null,
            avatarUrl: null,
            isActive: false,
            // Burn auth credentials so the user can no longer log in.
            passwordHash: crypto.randomBytes(32).toString('hex'),
            totpEnabled: false,
            totpSecretEncrypted: null,
            recoveryCodesHashed: [],
            sessionVersion: { increment: 1 }, // invalidate all JWTs
          },
        });
        // Anonymize Person rows globally
        await tx.person.updateMany({
          where: { userId },
          data: { firstName: 'Erased', lastName: 'User', email: null, phone: null },
        });
        // Revoke sessions
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'erasure_executed' },
        });
        await tx.trustedDevice.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        // Review #14: scrub identifying IP / UA fields so login history and
        // consent records can no longer re-identify the subject from network
        // metadata. The rows are kept for audit; only the identifiers go.
        await tx.loginHistory.updateMany({
          where: { userId },
          data: { ipAddress: null, userAgent: null },
        });
        await tx.consentRecord.updateMany({
          where: { userId },
          data: { ipAddress: null, userAgent: null },
        });
        await tx.magicLink.updateMany({
          where: { userId },
          data: { ipAddress: null, userAgent: null },
        });
      } else {
        // Org-scoped erasure: clear identifiers in this org's Person rows
        // (audit log links are kept by id; identifiers are gone).
        await tx.person.updateMany({
          where: { userId, organizationId: orgId },
          data: { firstName: 'Erased', lastName: 'User', email: null, phone: null },
        });
        // Remove their role assignments in this org so they can't access it.
        await tx.userRole.deleteMany({ where: { userId, organizationId: orgId } });
      }

      // Request status already updated by the CAS above; fetch the final row
      // for the response.
      const updated = await tx.erasureRequest.findUniqueOrThrow({ where: { id: requestId } });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'erasure_executed',
          entityType: 'ErasureRequest',
          entityId: requestId,
          changes: { targetUserId: userId, scope: orgId ? 'org' : 'global' } as any,
        },
      });

      return updated;
    });
  }

  // ============== CONSENT ==============

  async recordConsent(
    actor: Actor,
    dto: { consentType: string; state: 'given' | 'withdrawn'; organizationId?: string; policyVersion?: string },
    ctx: RequestCtx,
  ) {
    if (!dto.consentType || !/^[a-z0-9_]+$/i.test(dto.consentType) || dto.consentType.length > 60) {
      throw new BadRequestException('Invalid consentType');
    }
    if (dto.state !== 'given' && dto.state !== 'withdrawn') {
      throw new BadRequestException('state must be given or withdrawn');
    }
    // Review #11: consent changes are the POPIA Section 11 evidentiary record.
    // ConsentRecord is the state-of-the-world; AuditLog is the immutable
    // history. Both, in one transaction.
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.consentRecord.create({
        data: {
          userId: actor.userId,
          organizationId: dto.organizationId,
          consentType: dto.consentType,
          state: dto.state,
          policyVersion: dto.policyVersion,
          ipAddress: ctx.ip?.slice(0, 64),
          userAgent: ctx.userAgent?.slice(0, 500),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: dto.organizationId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'consent_recorded',
          entityType: 'ConsentRecord',
          entityId: row.id,
          changes: {
            consentType: dto.consentType,
            state: dto.state,
            policyVersion: dto.policyVersion,
          } as any,
        },
      });
      return row;
    });
  }

  async listMyConsents(actor: Actor) {
    return this.prisma.consentRecord.findMany({
      where: { userId: actor.userId },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }

  /** Current state per consentType: latest record wins. */
  async currentConsents(actor: Actor) {
    const rows = await this.prisma.consentRecord.findMany({
      where: { userId: actor.userId },
      orderBy: { occurredAt: 'desc' },
    });
    const latest = new Map<string, string>();
    for (const r of rows) if (!latest.has(r.consentType)) latest.set(r.consentType, r.state);
    return Object.fromEntries(latest);
  }

  // ============== HELPERS ==============

  private isAdmin(actor: Actor) {
    return ['hoa_admin', 'super_admin'].includes(actor.role);
  }
}
