import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../common/prisma.service';
import { Actor, isResidentRole, scopePassWhere } from '../common/scope.util';
import { generatePassCode, normalizePassCode } from '../common/code.util';
import { WebhooksService } from '../platform/webhooks.service';
import { CreatePassDto } from './dto/create-pass.dto';

type Validity = { valid: boolean; reason?: string };

@Injectable()
export class PassesService {
  constructor(private prisma: PrismaService, private webhooks: WebhooksService) {}

  private async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = generatePassCode(8);
      const existing = await this.prisma.gatePass.findUnique({ where: { code } });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not generate unique pass code, please retry');
  }

  private async renderQrSvg(code: string): Promise<string> {
    return QRCode.toString(code, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
      color: { dark: '#121212', light: '#fbfaf9' },
    });
  }

  private computeValidity(pass: any, now = new Date()): Validity {
    if (pass.status === 'revoked') return { valid: false, reason: 'revoked' };
    if (pass.status === 'used') return { valid: false, reason: 'already_used' };
    if (pass.usesCount >= pass.maxUses) return { valid: false, reason: 'max_uses_reached' };
    if (pass.type === 'emergency') return { valid: true };
    if (now < new Date(pass.validFrom)) return { valid: false, reason: 'not_yet_valid' };
    if (now > new Date(pass.validUntil)) return { valid: false, reason: 'expired' };
    if (pass.type === 'recurring') {
      const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      const dayName = days[now.getDay()];
      if (!pass.recurringDays.includes(dayName)) return { valid: false, reason: 'not_active_today' };
      if (pass.recurringWindow) {
        const hhmm = now.toTimeString().slice(0, 5);
        const win = pass.recurringWindow as { start: string; end: string };
        if (hhmm < win.start || hhmm > win.end) return { valid: false, reason: 'outside_window' };
      }
    }
    return { valid: true };
  }

  private async assertUnitAccessForResident(unitId: string, actor: Actor) {
    if (!isResidentRole(actor.role)) return;
    const occupancy = await this.prisma.unitOccupancy.findFirst({
      where: { unitId, isActive: true, person: { userId: actor.userId } },
    });
    if (!occupancy) {
      throw new ForbiddenException('You can only create passes for your own unit(s)');
    }
  }

  async create(orgId: string, actor: Actor, dto: CreatePassDto) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, estate: { organizationId: orgId } },
    });
    if (!unit) throw new NotFoundException('Unit not found in this organization');

    await this.assertUnitAccessForResident(dto.unitId, actor);

    const code = await this.generateUniqueCode();
    const maxUses = dto.type === 'event' ? Math.max(1, dto.maxUses ?? 1) : 1;

    const pass = await this.prisma.gatePass.create({
      data: {
        organizationId: orgId,
        unitId: dto.unitId,
        code,
        type: dto.type,
        visitorName: dto.visitorName,
        visitorPhone: dto.visitorPhone,
        vehicleReg: dto.vehicleReg,
        notes: dto.notes,
        validFrom: new Date(dto.validFrom),
        validUntil: new Date(dto.validUntil),
        maxUses,
        recurringDays: dto.recurringDays || [],
        recurringWindow: dto.recurringWindow as any,
        createdBy: actor.userId,
      },
      include: { unit: { include: { estate: true } } },
    });

    const qrSvg = await this.renderQrSvg(code);

    // Phase 9.2: webhook for hardware vendors (boom gates) to pre-load codes.
    this.webhooks.emit(orgId, 'gate_pass.created', {
      passId: pass.id,
      code: pass.code,
      type: pass.type,
      visitorName: pass.visitorName,
      vehicleReg: pass.vehicleReg,
      validFrom: pass.validFrom.toISOString(),
      validUntil: pass.validUntil.toISOString(),
      unitId: pass.unitId,
      maxUses: pass.maxUses,
    });

    return { ...pass, qrSvg };
  }

  async findAll(
    orgId: string,
    actor: Actor,
    query: { page?: number; limit?: number; status?: string; type?: string },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const baseWhere: any = { organizationId: orgId };
    if (query.status) baseWhere.status = query.status;
    if (query.type) baseWhere.type = query.type;
    const where = scopePassWhere(baseWhere, actor);

    const [data, total] = await Promise.all([
      this.prisma.gatePass.findMany({
        where,
        include: { unit: { include: { estate: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.gatePass.count({ where }),
    ]);

    return {
      success: true,
      data: data.map((p) => ({ ...p, validity: this.computeValidity(p) })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, orgId: string, actor: Actor) {
    const baseWhere: any = { id, organizationId: orgId };
    const where = scopePassWhere(baseWhere, actor);
    const pass = await this.prisma.gatePass.findFirst({
      where,
      include: {
        unit: { include: { estate: true } },
        logs: { orderBy: { occurredAt: 'desc' }, take: 50 },
      },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    const qrSvg = await this.renderQrSvg(pass.code);
    return { ...pass, qrSvg, validity: this.computeValidity(pass) };
  }

  async revoke(id: string, orgId: string, actor: Actor) {
    const baseWhere: any = { id, organizationId: orgId };
    const where = scopePassWhere(baseWhere, actor);
    const pass = await this.prisma.gatePass.findFirst({ where });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status === 'revoked') {
      throw new BadRequestException('Pass is already revoked');
    }
    return this.prisma.gatePass.update({
      where: { id },
      data: { status: 'revoked', revokedAt: new Date(), revokedBy: actor.userId },
    });
  }

  /** Public — visitor-facing payload. No auth. Safe subset of fields. */
  async findPublicByCode(rawCode: string) {
    const code = normalizePassCode(rawCode);
    const pass = await this.prisma.gatePass.findUnique({
      where: { code },
      include: { unit: { include: { estate: true } } },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');

    const validity = this.computeValidity(pass);
    const qrSvg = await this.renderQrSvg(pass.code);

    return {
      code: pass.code,
      visitorName: pass.visitorName,
      vehicleReg: pass.vehicleReg,
      type: pass.type,
      status: pass.status,
      validFrom: pass.validFrom,
      validUntil: pass.validUntil,
      recurringDays: pass.recurringDays,
      recurringWindow: pass.recurringWindow,
      estate: { name: pass.unit?.estate?.name, address: pass.unit?.estate?.address },
      unit: { unitNumber: pass.unit?.unitNumber, block: pass.unit?.block },
      validity,
      qrSvg,
    };
  }

  /** Gate-operator scan/lookup. */
  async verifyForGate(rawCode: string, orgId: string) {
    const code = normalizePassCode(rawCode);
    const pass = await this.prisma.gatePass.findFirst({
      where: { code, organizationId: orgId },
      include: {
        unit: { include: { estate: true } },
        logs: { orderBy: { occurredAt: 'desc' }, take: 5 },
      },
    });
    if (!pass) throw new NotFoundException('No matching pass for this code');
    const validity = this.computeValidity(pass);
    return { ...pass, validity };
  }

  async logEntry(
    id: string,
    orgId: string,
    actor: Actor,
    dto: { notes?: string; overrideReason?: string },
  ) {
    const pass = await this.prisma.gatePass.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');

    const validity = this.computeValidity(pass);
    const isOverride = !validity.valid;
    if (isOverride && !dto.overrideReason) {
      throw new BadRequestException(
        `Pass is not currently valid (${validity.reason}). overrideReason is required to log entry anyway.`,
      );
    }

    const updatedUses = pass.usesCount + 1;
    const reachedMax = updatedUses >= pass.maxUses;

    const [log, updated] = await this.prisma.$transaction([
      this.prisma.visitorLog.create({
        data: {
          gatePassId: id,
          type: isOverride ? 'override_entry' : 'entry',
          recordedBy: actor.userId,
          notes: dto.notes,
          overrideReason: dto.overrideReason,
        },
      }),
      this.prisma.gatePass.update({
        where: { id },
        data: {
          usesCount: updatedUses,
          status: reachedMax && pass.type !== 'recurring' ? 'used' : pass.status,
        },
      }),
    ]);

    return { log, pass: updated };
  }

  async logExit(id: string, orgId: string, actor: Actor, dto: { notes?: string }) {
    const pass = await this.prisma.gatePass.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    return this.prisma.visitorLog.create({
      data: {
        gatePassId: id,
        type: 'exit',
        recordedBy: actor.userId,
        notes: dto.notes,
      },
    });
  }

  async logDeny(id: string, orgId: string, actor: Actor, reason: string) {
    const pass = await this.prisma.gatePass.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    return this.prisma.visitorLog.create({
      data: {
        gatePassId: id,
        type: 'denied',
        recordedBy: actor.userId,
        overrideReason: reason,
      },
    });
  }

  // ============ Visitor logs ============

  async getLogs(
    orgId: string,
    query: { page?: number; limit?: number; from?: string; to?: string; unitId?: string },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 50));

    const where: any = { gatePass: { organizationId: orgId } };
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = new Date(query.from);
      if (query.to) where.occurredAt.lte = new Date(query.to);
    }
    if (query.unitId) where.gatePass.unitId = query.unitId;

    const [data, total] = await Promise.all([
      this.prisma.visitorLog.findMany({
        where,
        include: {
          gatePass: {
            include: { unit: { include: { estate: true } } },
          },
        },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.visitorLog.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTodayLogs(orgId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const where: any = {
      gatePass: { organizationId: orgId },
      occurredAt: { gte: start, lte: end },
    };

    const logs = await this.prisma.visitorLog.findMany({
      where,
      include: {
        gatePass: {
          include: { unit: { include: { estate: true } } },
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    });

    const counts = logs.reduce(
      (acc, l) => {
        acc.total++;
        if (l.type === 'entry' || l.type === 'override_entry') acc.entries++;
        if (l.type === 'exit') acc.exits++;
        if (l.type === 'denied') acc.denied++;
        if (l.type === 'override_entry') acc.overrides++;
        return acc;
      },
      { total: 0, entries: 0, exits: 0, denied: 0, overrides: 0 },
    );

    return { success: true, data: { logs, counts } };
  }
}
