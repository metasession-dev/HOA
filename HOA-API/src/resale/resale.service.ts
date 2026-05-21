import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { SnapshotService } from './snapshot.service';
import {
  CreateResaleDto,
  UpdateResaleDto,
  CreateAccessLinkDto,
  CancelResaleDto,
} from './dto/resale.dto';

export type Actor = { userId: string; role: string };

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['issued', 'cancelled'],
  issued: ['superseded', 'cancelled'],
  superseded: [],
  cancelled: [],
};

const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_LEN = 32;

@Injectable()
export class ResaleService {
  constructor(
    private prisma: PrismaService,
    private snapshot: SnapshotService,
  ) {}

  async list(
    orgId: string,
    query: { status?: string; unitId?: string; search?: string },
  ) {
    const where: Prisma.ResaleCertificateWhereInput = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.unitId) where.unitId = query.unitId;
    if (query.search) {
      where.OR = [
        { certificateNumber: { contains: query.search, mode: 'insensitive' } },
        { unit: { unitNumber: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.resaleCertificate.findMany({
      where,
      include: { unit: { include: { estate: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, orgId: string) {
    const r = await this.prisma.resaleCertificate.findFirst({
      where: { id, organizationId: orgId },
      include: {
        unit: { include: { estate: { select: { name: true } } } },
        accessLinks: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!r) throw new NotFoundException('Resale certificate not found');
    return r;
  }

  async create(orgId: string, actor: Actor, dto: CreateResaleDto) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, estate: { organizationId: orgId } },
    });
    if (!unit) throw new NotFoundException('Unit not found');

    const snapshot = await this.snapshot.forUnit(dto.unitId, orgId);
    const goodStanding = snapshot.balance <= 0.01;
    const currency = dto.transferLevyCurrency ?? snapshot.currency;
    const slaDays = dto.rushProcessing ? 3 : 14;

    // Retry on certificate-number collision under concurrent creates. The
    // sequence is computed inside the transaction with a Postgres advisory
    // lock so two concurrent creates can't reserve the same number.
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.createWithLockedNumber(orgId, actor, dto, snapshot, goodStanding, currency, slaDays);
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < MAX_RETRIES - 1) continue;
        throw err;
      }
    }
    throw new ConflictException('Unable to allocate a unique certificate number');
  }

  private async createWithLockedNumber(
    orgId: string,
    actor: Actor,
    dto: CreateResaleDto,
    snapshot: any,
    goodStanding: boolean,
    currency: string,
    slaDays: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Postgres advisory lock keyed off orgId to serialize cert-number assignment
      // within the org without blocking other orgs.
      const orgLockKey = this.hashToBigInt(orgId);
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${orgLockKey})`);
      const certificateNumber = await this.nextCertificateNumber(orgId, tx);
      const cert = await tx.resaleCertificate.create({
        data: {
          organizationId: orgId,
          unitId: dto.unitId,
          certificateNumber,
          transferAttorney: (dto.transferAttorney ?? null) as unknown as Prisma.InputJsonValue,
          buyer: (dto.buyer ?? null) as unknown as Prisma.InputJsonValue,
          seller: (dto.seller ?? null) as unknown as Prisma.InputJsonValue,
          transferLevyAmount: new Decimal(dto.transferLevyAmount),
          transferLevyCurrency: currency,
          feeAmount: new Decimal(dto.feeAmount ?? 0),
          outstandingAtSnapshot: new Decimal(snapshot.balance),
          financialStatusJson: snapshot as unknown as Prisma.InputJsonValue,
          disclosureChecklist: (dto.disclosureChecklist ?? []) as unknown as Prisma.InputJsonValue,
          attachments: (dto.attachments ?? []) as unknown as Prisma.InputJsonValue,
          goodStanding,
          notes: dto.notes,
          rushProcessing: dto.rushProcessing ?? false,
          slaDueAt: new Date(Date.now() + slaDays * 86400000),
          createdBy: actor.userId,
        },
      });
      await tx.resaleEvent.create({
        data: {
          resaleCertificateId: cert.id,
          type: 'status_change',
          actorId: actor.userId,
          payload: { to: 'draft', goodStanding, balance: snapshot.balance } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'created',
          entityType: 'ResaleCertificate',
          entityId: cert.id,
          changes: { certificateNumber, goodStanding, balance: snapshot.balance } as any,
        },
      });
      return cert;
    });
  }

  async update(id: string, orgId: string, actor: Actor, dto: UpdateResaleDto) {
    const existing = await this.findById(id, orgId);
    if (existing.status !== 'draft') {
      throw new ConflictException(`Resale certificate is ${existing.status}; can only edit while draft`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.resaleCertificate.update({
        where: { id },
        data: {
          transferAttorney: dto.transferAttorney !== undefined ? (dto.transferAttorney as unknown as Prisma.InputJsonValue) : undefined,
          buyer: dto.buyer !== undefined ? (dto.buyer as unknown as Prisma.InputJsonValue) : undefined,
          seller: dto.seller !== undefined ? (dto.seller as unknown as Prisma.InputJsonValue) : undefined,
          transferLevyAmount: dto.transferLevyAmount !== undefined ? new Decimal(dto.transferLevyAmount) : undefined,
          transferLevyCurrency: dto.transferLevyCurrency,
          feeAmount: dto.feeAmount !== undefined ? new Decimal(dto.feeAmount) : undefined,
          disclosureChecklist: dto.disclosureChecklist !== undefined ? (dto.disclosureChecklist as unknown as Prisma.InputJsonValue) : undefined,
          attachments: dto.attachments !== undefined ? (dto.attachments as unknown as Prisma.InputJsonValue) : undefined,
          notes: dto.notes,
          rushProcessing: dto.rushProcessing,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'updated',
          entityType: 'ResaleCertificate',
          entityId: id,
          changes: {
            before: {
              transferAttorney: existing.transferAttorney,
              buyer: existing.buyer,
              seller: existing.seller,
              transferLevyAmount: existing.transferLevyAmount,
              feeAmount: existing.feeAmount,
              rushProcessing: existing.rushProcessing,
            },
            after: {
              transferAttorney: updated.transferAttorney,
              buyer: updated.buyer,
              seller: updated.seller,
              transferLevyAmount: updated.transferLevyAmount,
              feeAmount: updated.feeAmount,
              rushProcessing: updated.rushProcessing,
            },
          } as any,
        },
      });
      return updated;
    });
  }

  async refreshSnapshot(id: string, orgId: string, actor: Actor) {
    const existing = await this.findById(id, orgId);
    if (existing.status !== 'draft') {
      throw new ConflictException('Snapshot can only be refreshed while draft');
    }
    return this.prisma.$transaction(async (tx) => {
      const snap = await this.snapshot.forUnit(existing.unitId, orgId, tx);
      const goodStanding = snap.balance <= 0.01;
      const updated = await tx.resaleCertificate.update({
        where: { id },
        data: {
          financialStatusJson: snap as unknown as Prisma.InputJsonValue,
          outstandingAtSnapshot: new Decimal(snap.balance),
          goodStanding,
        },
      });
      await tx.resaleEvent.create({
        data: {
          resaleCertificateId: id,
          type: 'snapshot_refreshed',
          actorId: actor.userId,
          payload: { balance: snap.balance, goodStanding } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'snapshot_refreshed',
          entityType: 'ResaleCertificate',
          entityId: id,
          changes: {
            before: {
              balance: existing.outstandingAtSnapshot,
              goodStanding: existing.goodStanding,
            },
            after: { balance: snap.balance, goodStanding },
          } as any,
        },
      });
      return updated;
    });
  }

  async issue(id: string, orgId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      // Row-lock the certificate so two concurrent issue calls can't both pass the
      // status==='draft' check and double-write the status_change + audit rows.
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, status, "unitId" FROM resale_certificates WHERE id = $1 AND "organizationId" = $2 FOR UPDATE`,
        id,
        orgId,
      );
      const cert = rows[0];
      if (!cert) throw new NotFoundException('Resale certificate not found');
      if (!ALLOWED_TRANSITIONS[cert.status]?.includes('issued')) {
        throw new ConflictException(`Cannot issue from status ${cert.status}`);
      }
      // Refresh snapshot at issue time to freeze the latest financial state
      const snap = await this.snapshot.forUnit(cert.unitId, orgId, tx);
      const goodStanding = snap.balance <= 0.01;

      const issued = await tx.resaleCertificate.update({
        where: { id },
        data: {
          status: 'issued',
          issuedAt: new Date(),
          issuedBy: actor.userId,
          financialStatusJson: snap as unknown as Prisma.InputJsonValue,
          outstandingAtSnapshot: new Decimal(snap.balance),
          goodStanding,
        },
      });
      await tx.resaleEvent.create({
        data: {
          resaleCertificateId: id,
          type: 'status_change',
          actorId: actor.userId,
          payload: { to: 'issued', goodStanding, balance: snap.balance } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'issued',
          entityType: 'ResaleCertificate',
          entityId: id,
          changes: { goodStanding, balance: snap.balance } as any,
        },
      });
      return issued;
    });
  }

  async cancel(id: string, orgId: string, actor: Actor, dto: CancelResaleDto) {
    return this.prisma.$transaction(async (tx) => {
      const cert = await tx.resaleCertificate.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!cert) throw new NotFoundException('Resale certificate not found');
      if (!ALLOWED_TRANSITIONS[cert.status]?.includes('cancelled')) {
        throw new ConflictException(`Cannot cancel from status ${cert.status}`);
      }
      const updated = await tx.resaleCertificate.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelledReason: dto.reason },
      });
      // Revoke all active access links
      await tx.resaleAccessLink.updateMany({
        where: { resaleCertificateId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.resaleEvent.create({
        data: {
          resaleCertificateId: id,
          type: 'status_change',
          actorId: actor.userId,
          payload: { to: 'cancelled', reason: dto.reason } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'cancelled',
          entityType: 'ResaleCertificate',
          entityId: id,
          changes: { reason: dto.reason } as any,
        },
      });
      return updated;
    });
  }

  async createAccessLink(
    certificateId: string,
    orgId: string,
    actor: Actor,
    dto: CreateAccessLinkDto,
  ) {
    const cert = await this.findById(certificateId, orgId);
    if (cert.status !== 'issued') {
      throw new ConflictException('Access links can only be created for issued certificates');
    }
    const expiryDays = Math.min(60, Math.max(1, dto.expiryDays ?? 14));
    const token = this.generateToken();
    const link = await this.prisma.$transaction(async (tx) => {
      const created = await tx.resaleAccessLink.create({
        data: {
          resaleCertificateId: certificateId,
          token,
          recipientLabel: dto.recipientLabel,
          expiresAt: new Date(Date.now() + expiryDays * 86400000),
          createdBy: actor.userId,
        },
      });
      await tx.resaleEvent.create({
        data: {
          resaleCertificateId: certificateId,
          type: 'access_link_created',
          actorId: actor.userId,
          payload: { recipientLabel: dto.recipientLabel, expiryDays } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'access_link_created',
          entityType: 'ResaleCertificate',
          entityId: certificateId,
          changes: { recipientLabel: dto.recipientLabel } as any,
        },
      });
      return created;
    });
    return link;
  }

  async revokeAccessLink(linkId: string, orgId: string, actor: Actor) {
    const link = await this.prisma.resaleAccessLink.findFirst({
      where: { id: linkId, resaleCertificate: { organizationId: orgId } },
      include: { resaleCertificate: { select: { id: true } } },
    });
    if (!link) throw new NotFoundException('Access link not found');
    if (link.revokedAt) return link;
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.resaleAccessLink.update({
        where: { id: linkId },
        data: { revokedAt: new Date() },
      });
      await tx.resaleEvent.create({
        data: {
          resaleCertificateId: link.resaleCertificate.id,
          type: 'access_link_revoked',
          actorId: actor.userId,
          payload: { linkId } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'access_link_revoked',
          entityType: 'ResaleAccessLink',
          entityId: linkId,
          changes: {} as any,
        },
      });
      return r;
    });
    return updated;
  }

  async accessLogs(linkId: string, orgId: string) {
    const link = await this.prisma.resaleAccessLink.findFirst({
      where: { id: linkId, resaleCertificate: { organizationId: orgId } },
    });
    if (!link) throw new NotFoundException('Access link not found');
    return this.prisma.resaleAccessLog.findMany({
      where: { linkId },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }

  /** Public — no auth. Logs the access. Throws on expired/revoked/missing. */
  async publicView(token: string, ip?: string, userAgent?: string) {
    const link = await this.prisma.resaleAccessLink.findUnique({
      where: { token },
      include: {
        resaleCertificate: {
          include: {
            unit: { include: { estate: { select: { name: true, organization: { select: { name: true, logoUrl: true } } } } } },
          },
        },
      },
    });
    // Always log access attempts before responding — even failures. Helps detect
    // token-probing and revoked-link abuse.
    if (link) {
      try {
        await this.prisma.resaleAccessLog.create({
          data: {
            linkId: link.id,
            ipAddress: ip?.slice(0, 64),
            userAgent: userAgent?.slice(0, 500),
          },
        });
      } catch {
        // Best-effort: never let a logging failure mask the real response.
      }
    }
    if (!link) throw new NotFoundException('Link not found or revoked');
    if (link.revokedAt) throw new ForbiddenException('Link has been revoked');
    if (link.expiresAt < new Date()) throw new ForbiddenException('Link has expired');
    if (link.resaleCertificate.status === 'cancelled') {
      throw new ForbiddenException('Certificate has been cancelled');
    }

    // Successful view counter (the access log was already written above so we
    // capture failed access attempts too).
    await this.prisma.resaleAccessLink.update({
      where: { id: link.id },
      data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    });

    const cert = link.resaleCertificate;

    // Sanitize the financial snapshot: strip internal database IDs so external
    // attorneys never see our row identifiers. They only need references + amounts.
    const snap = cert.financialStatusJson as any;
    const sanitizedSnapshot = snap && typeof snap === 'object'
      ? {
          asOf: snap.asOf,
          currency: snap.currency,
          totalLevied: snap.totalLevied,
          totalPaid: snap.totalPaid,
          balance: snap.balance,
          invoices: Array.isArray(snap.invoices)
            ? snap.invoices.map((i: any) => ({
                reference: i.reference,
                issueDate: i.issueDate,
                dueDate: i.dueDate,
                amount: i.amount,
                status: i.status,
                notes: i.notes,
              }))
            : [],
          payments: Array.isArray(snap.payments)
            ? snap.payments.map((p: any) => ({
                reference: p.reference,
                receivedDate: p.receivedDate,
                amount: p.amount,
                method: p.method,
                status: p.status,
              }))
            : [],
        }
      : null;

    return {
      certificateNumber: cert.certificateNumber,
      status: cert.status,
      issuedAt: cert.issuedAt,
      organization: cert.unit.estate.organization,
      estate: { name: cert.unit.estate.name },
      unit: { unitNumber: cert.unit.unitNumber, block: cert.unit.block, floor: cert.unit.floor },
      buyer: cert.buyer,
      seller: cert.seller,
      transferAttorney: cert.transferAttorney,
      transferLevy: { amount: cert.transferLevyAmount, currency: cert.transferLevyCurrency },
      fee: { amount: cert.feeAmount, currency: cert.transferLevyCurrency },
      goodStanding: cert.goodStanding,
      outstandingAtSnapshot: cert.outstandingAtSnapshot,
      financialStatus: sanitizedSnapshot,
      disclosureChecklist: cert.disclosureChecklist,
      attachments: cert.attachments,
      recipientLabel: link.recipientLabel,
      expiresAt: link.expiresAt,
    };
  }

  private async nextCertificateNumber(
    orgId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const year = new Date().getUTCFullYear();
    const prefix = `RC-${year}-`;
    const latest = await client.resaleCertificate.findFirst({
      where: { organizationId: orgId, certificateNumber: { startsWith: prefix } },
      orderBy: { certificateNumber: 'desc' },
      select: { certificateNumber: true },
    });
    const nextSeq = latest ? Number(latest.certificateNumber.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  /** Stable 63-bit integer derived from a string, for use with pg_advisory_lock. */
  private hashToBigInt(s: string): string {
    let h = 0n;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5n) - h + BigInt(s.charCodeAt(i))) & 0x7fffffffffffffffn;
    }
    return h.toString();
  }

  private generateToken(): string {
    const bytes = crypto.randomBytes(TOKEN_LEN);
    let out = '';
    for (let i = 0; i < TOKEN_LEN; i++) {
      out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
    }
    return out;
  }
}
