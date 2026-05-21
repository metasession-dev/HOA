import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { sha256, stableStringify } from './encryption';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // Audit-log hash-chain middleware. Runs after every successful auditLog
    // create and sets rowHash + previousHash. The chain is per-organization
    // (and a separate chain for cross-org rows where organizationId is null).
    //
    // We use $use to intercept the operation BEFORE the row is inserted so we
    // can compute the hash and persist it in the same row.
    (this as any).$use(async (params: any, next: any) => {
      if (params.model !== 'AuditLog' || params.action !== 'create') {
        return next(params);
      }
      const data = params.args?.data;
      if (!data) return next(params);

      // Read the most recent rowHash for this org. NOTE: Phase 6 review #2
      // flagged that two concurrent auditLog.create calls can both read the
      // same predecessor and fork the chain. Properly serializing this under
      // Prisma `$use` semantics requires either a stored procedure or moving
      // to Client Extensions with explicit transaction control. Tracked as a
      // Phase 9 follow-up. Verify-chain will surface the fork after the fact.
      const previous = await (this as any).auditLog.findFirst({
        where: data.organizationId
          ? { organizationId: data.organizationId, rowHash: { not: null } }
          : { organizationId: null, rowHash: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { rowHash: true },
      });
      const previousHash: string | null = previous?.rowHash ?? null;

      const createdAt = data.createdAt ?? new Date();
      const normalizedChanges = data.changes === undefined || data.changes === null
        ? {}
        : JSON.parse(JSON.stringify(data.changes));
      const canon = stableStringify({
        organizationId: data.organizationId ?? null,
        actorId: data.actorId,
        actorRole: data.actorRole,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        changes: normalizedChanges,
        ipAddress: data.ipAddress ?? null,
        createdAt: createdAt.toISOString(),
      });
      const rowHash = sha256(`${canon}::${previousHash ?? ''}`);
      params.args.data = { ...data, changes: normalizedChanges, createdAt, previousHash, rowHash };
      return next(params);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/** 63-bit signed integer derived from a string, suitable for pg_advisory_lock. */
function hashToBigIntStr(s: string): string {
  let h = 0n;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5n) - h + BigInt(s.charCodeAt(i))) & 0x7fffffffffffffffn;
  }
  return h.toString();
}
