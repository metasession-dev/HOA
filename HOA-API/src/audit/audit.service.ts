import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { paginatedResponse } from '../common/dto';
import { sha256, stableStringify } from '../common/encryption';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, page = 1, limit = 50, entityType?: string) {
    const where: any = { organizationId: orgId };
    if (entityType) where.entityType = entityType;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { firstName: true, lastName: true, email: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async log(data: {
    organizationId?: string;
    actorId: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    changes?: any;
    ipAddress?: string;
  }) {
    return this.prisma.auditLog.create({ data });
  }

  /**
   * Phase 6: hash-chain verification. Walks every AuditLog row in createdAt
   * order and recomputes each rowHash from (canonicalize(row) || previousHash).
   * Reports rows where the stored hash diverges. Both columns are nullable so
   * pre-Phase-6 rows are skipped.
   *
   * Note: Phase 6 introduces the columns and a verify endpoint; the actual
   * "write hash on insert" hook is wired through a Prisma extension in
   * `audit-chain.middleware.ts`.
   */
  async verifyChain(orgId: string, sinceIso?: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        rowHash: { not: null },
        ...(sinceIso ? { createdAt: { gte: new Date(sinceIso) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, organizationId: true, actorId: true, actorRole: true,
        action: true, entityType: true, entityId: true, changes: true,
        ipAddress: true, createdAt: true, previousHash: true, rowHash: true,
      },
    });

    const failures: Array<{ id: string; createdAt: Date; reason: string }> = [];
    let previousHash: string | null = null;

    for (const r of rows) {
      const expected = this.computeRowHash(r, r.previousHash);
      if (r.previousHash !== previousHash) {
        failures.push({ id: r.id, createdAt: r.createdAt, reason: 'previousHash mismatch (chain broken)' });
      }
      if (r.rowHash !== expected) {
        failures.push({ id: r.id, createdAt: r.createdAt, reason: 'rowHash diverges (row mutated)' });
      }
      previousHash = r.rowHash;
    }

    return {
      organizationId: orgId,
      rowsChecked: rows.length,
      firstAt: rows[0]?.createdAt ?? null,
      lastAt: rows[rows.length - 1]?.createdAt ?? null,
      valid: failures.length === 0,
      failures,
    };
  }

  /**
   * Pure canonical hash for a row. Excludes id/rowHash/previousHash from the
   * input; the previousHash is appended at the end so the chain is verifiable
   * by reading rows in order.
   */
  computeRowHash(row: {
    organizationId: string | null;
    actorId: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    changes: any;
    ipAddress: string | null;
    createdAt: Date;
  }, previousHash: string | null): string {
    const canon = stableStringify({
      organizationId: row.organizationId ?? null,
      actorId: row.actorId,
      actorRole: row.actorRole,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      changes: row.changes ?? {},
      ipAddress: row.ipAddress ?? null,
      createdAt: row.createdAt.toISOString(),
    });
    return sha256(`${canon}::${previousHash ?? ''}`);
  }
}
