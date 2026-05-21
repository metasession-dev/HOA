import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import {
  CreateVendorDto,
  UpdateVendorDto,
  ChangeVendorStatusDto,
  VendorDocumentDto,
} from './dto/vendors.dto';

export type Actor = { userId: string; role: string };

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string, query: { status?: string; search?: string }) {
    const where: Prisma.VendorWhereInput = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { taxNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const items = await this.prisma.vendor.findMany({
      where,
      include: { defaultGlAccount: { select: { id: true, code: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return items;
  }

  async findById(id: string, orgId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId: orgId },
      include: { defaultGlAccount: { select: { id: true, code: true, name: true } } },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async create(orgId: string, actor: Actor, dto: CreateVendorDto) {
    await this.validateGl(orgId, dto.defaultGlAccountId);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const vendor = await tx.vendor.create({
          data: {
            organizationId: orgId,
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            taxNumber: dto.taxNumber,
            registrationNo: dto.registrationNo,
            bankAccountName: dto.bankAccountName,
            bankName: dto.bankName,
            bankAccountNo: dto.bankAccountNo,
            bankBranchCode: dto.bankBranchCode,
            preferredCurrency: dto.preferredCurrency ?? 'ZAR',
            documents: (dto.documents ?? []) as unknown as Prisma.InputJsonValue,
            defaultGlAccountId: dto.defaultGlAccountId,
            rating: dto.rating,
            notes: dto.notes,
            createdBy: actor.userId,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'created',
            entityType: 'Vendor',
            entityId: vendor.id,
            changes: { after: vendor } as any,
          },
        });
        return vendor;
      });
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A vendor named "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, orgId: string, actor: Actor, dto: UpdateVendorDto) {
    const existing = await this.findById(id, orgId);
    if (existing.status === 'blacklisted') {
      throw new ConflictException('Cannot edit a blacklisted vendor. Reactivate first.');
    }
    await this.validateGl(orgId, dto.defaultGlAccountId);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const v = await tx.vendor.update({
          where: { id },
          data: {
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            taxNumber: dto.taxNumber,
            registrationNo: dto.registrationNo,
            bankAccountName: dto.bankAccountName,
            bankName: dto.bankName,
            bankAccountNo: dto.bankAccountNo,
            bankBranchCode: dto.bankBranchCode,
            preferredCurrency: dto.preferredCurrency,
            documents: dto.documents ? (dto.documents as unknown as Prisma.InputJsonValue) : undefined,
            defaultGlAccountId: dto.defaultGlAccountId,
            rating: dto.rating,
            notes: dto.notes,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'updated',
            entityType: 'Vendor',
            entityId: v.id,
            changes: { before: existing, after: v } as any,
          },
        });
        return v;
      });
      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A vendor named "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async changeStatus(
    id: string,
    orgId: string,
    actor: Actor,
    dto: ChangeVendorStatusDto,
  ) {
    const existing = await this.findById(id, orgId);
    if (existing.status === dto.status) return existing;

    if (dto.status === 'blacklisted') {
      const pending = await this.prisma.vendorInvoice.count({
        where: { vendorId: id, status: { in: ['captured', 'pending_approval', 'approved'] } },
      });
      if (pending > 0) {
        throw new ConflictException(
          `Cannot blacklist vendor: ${pending} invoice(s) still pending payment. Cancel or pay them first.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const v = await tx.vendor.update({
        where: { id },
        data: { status: dto.status },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: `status_${dto.status}`,
          entityType: 'Vendor',
          entityId: v.id,
          changes: { before: { status: existing.status }, after: { status: v.status }, reason: dto.reason } as any,
        },
      });
      return v;
    });
  }

  async attachDocument(id: string, orgId: string, actor: Actor, doc: VendorDocumentDto) {
    const vendor = await this.findById(id, orgId);
    const docs = Array.isArray(vendor.documents) ? (vendor.documents as any[]) : [];
    if (docs.length >= 20) {
      throw new BadRequestException('Maximum 20 documents per vendor reached');
    }
    const next = [...docs, { ...doc, uploadedAt: new Date().toISOString() }];
    const updated = await this.prisma.vendor.update({
      where: { id },
      data: { documents: next as unknown as Prisma.InputJsonValue },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'document_attached',
        entityType: 'Vendor',
        entityId: id,
        changes: { document: doc } as any,
      },
    });
    return updated;
  }

  /** Vendors with documents expiring in the next `days` days. */
  async expiringDocuments(orgId: string, days = 30) {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId: orgId, status: 'active' },
      select: { id: true, name: true, documents: true },
    });
    const cutoff = new Date(Date.now() + days * 86400000);
    const out: Array<{ vendorId: string; vendorName: string; document: any; daysUntilExpiry: number }> = [];
    for (const v of vendors) {
      const docs = Array.isArray(v.documents) ? (v.documents as any[]) : [];
      for (const d of docs) {
        if (!d?.expiresAt) continue;
        const exp = new Date(d.expiresAt);
        if (!isFinite(exp.getTime())) continue;
        if (exp <= cutoff) {
          out.push({
            vendorId: v.id,
            vendorName: v.name,
            document: d,
            daysUntilExpiry: Math.ceil((exp.getTime() - Date.now()) / 86400000),
          });
        }
      }
    }
    return out.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  private async validateGl(orgId: string, glAccountId?: string) {
    if (!glAccountId) return;
    const gl = await this.prisma.gLAccount.findFirst({
      where: { id: glAccountId, organizationId: orgId, isActive: true },
    });
    if (!gl) throw new BadRequestException('Invalid GL account');
  }
}
