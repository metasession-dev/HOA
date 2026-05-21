import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';

export type Actor = { userId: string; role: string };

/**
 * Phase 8.2 FX engine.
 *
 * Rate resolution is org-aware: a lookup tries org-scoped overrides first,
 * then falls back to global rates (orgId=null), then to 1.0 when the pair is
 * the same currency. Daily Open Exchange Rates sync lives behind an env
 * (OXR_APP_ID) but defers actually hitting the network — when the env isn't
 * set the cron just no-ops. Operators can enter manual rates via the admin
 * UI at any time; those become the org's authoritative rate for that day.
 */

const CURRENCY_RE = /^[A-Z]{3}$/;
// Review #7: shorter default lookback so we don't silently quote a rate from
// a month ago. Configurable via env for orgs with infrequent updates.
const FX_LOOKBACK_DAYS = Number(process.env.FX_LOOKBACK_DAYS) || 3;
const FX_STALE_AFTER_DAYS = Number(process.env.FX_STALE_AFTER_DAYS) || 1;

export type RateLookup = {
  rate: Decimal;
  asOfDate: Date;
  source: string;
  ageDays: number;
  isStale: boolean;
};

@Injectable()
export class FxService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolve the conversion rate for `from → to`. Returns just the Decimal for
   * callers that don't care about freshness. Throws when no rate exists in the
   * lookback window.
   */
  async rateFor(
    fromCurrency: string,
    toCurrency: string,
    asOf: Date = new Date(),
    orgId?: string,
  ): Promise<Decimal> {
    if (fromCurrency === toCurrency) return new Decimal(1);
    const lookup = await this.rateForWithMeta(fromCurrency, toCurrency, asOf, orgId);
    return lookup.rate;
  }

  /** Same as rateFor but returns the row metadata so callers can warn on staleness. */
  async rateForWithMeta(
    fromCurrency: string,
    toCurrency: string,
    asOf: Date = new Date(),
    orgId?: string,
  ): Promise<RateLookup> {
    if (fromCurrency === toCurrency) {
      const day = startOfUtcDay(asOf);
      return { rate: new Decimal(1), asOfDate: day, source: 'identity', ageDays: 0, isStale: false };
    }
    this.validateCcy(fromCurrency);
    this.validateCcy(toCurrency);

    const asOfDay = startOfUtcDay(asOf);
    const lookbackStart = new Date(asOfDay.getTime() - FX_LOOKBACK_DAYS * 86400000);
    const orgRate = orgId
      ? await this.prisma.exchangeRate.findFirst({
          where: {
            organizationId: orgId,
            fromCurrency, toCurrency,
            asOfDate: { gte: lookbackStart, lte: asOfDay },
          },
          orderBy: { asOfDate: 'desc' },
        })
      : null;
    if (orgRate) return this.toLookup(orgRate.rate, orgRate.asOfDate, orgRate.source, asOfDay);

    const globalRate = await this.prisma.exchangeRate.findFirst({
      where: {
        organizationId: null,
        fromCurrency, toCurrency,
        asOfDate: { gte: lookbackStart, lte: asOfDay },
      },
      orderBy: { asOfDate: 'desc' },
    });
    if (globalRate) return this.toLookup(globalRate.rate, globalRate.asOfDate, globalRate.source, asOfDay);

    // Try the inverse pair before giving up — many systems only store one
    // direction (e.g. USD → ZAR). 1/rate works for direct conversions.
    const inverse = await this.prisma.exchangeRate.findFirst({
      where: {
        OR: orgId
          ? [{ organizationId: orgId }, { organizationId: null }]
          : [{ organizationId: null }],
        fromCurrency: toCurrency,
        toCurrency: fromCurrency,
        asOfDate: { gte: lookbackStart, lte: asOfDay },
      },
      orderBy: [{ organizationId: 'desc' }, { asOfDate: 'desc' }],
    });
    if (inverse) {
      const r = new Decimal(inverse.rate.toString());
      if (r.isZero()) throw new BadRequestException('Found a zero inverse rate');
      return this.toLookup(new Decimal(1).div(r), inverse.asOfDate, `${inverse.source}_inverse`, asOfDay);
    }

    throw new NotFoundException(`No FX rate available for ${fromCurrency} → ${toCurrency} within the last ${FX_LOOKBACK_DAYS} days (as of ${asOfDay.toISOString().slice(0, 10)})`);
  }

  private toLookup(rate: Decimal | { toString(): string }, asOfDate: Date, source: string, requestedAsOf: Date): RateLookup {
    const ageDays = Math.max(0, Math.floor((requestedAsOf.getTime() - asOfDate.getTime()) / 86400000));
    return {
      rate: rate instanceof Decimal ? rate : new Decimal(rate.toString()),
      asOfDate,
      source,
      ageDays,
      isStale: ageDays >= FX_STALE_AFTER_DAYS,
    };
  }

  /** Convenience: convert `amount` from→to using the resolved rate. */
  async convert(
    amount: number | Decimal,
    fromCurrency: string,
    toCurrency: string,
    asOf: Date = new Date(),
    orgId?: string,
  ): Promise<{ amount: Decimal; rate: Decimal; asOfDate: Date; source: string; ageDays: number; isStale: boolean }> {
    const lookup = await this.rateForWithMeta(fromCurrency, toCurrency, asOf, orgId);
    const amt = typeof amount === 'number' ? new Decimal(amount) : amount;
    return {
      amount: amt.times(lookup.rate),
      rate: lookup.rate,
      asOfDate: lookup.asOfDate,
      source: lookup.source,
      ageDays: lookup.ageDays,
      isStale: lookup.isStale,
    };
  }

  /** List rates the org can see (own + global), most recent first. */
  async list(
    orgId: string,
    query: { fromCurrency?: string; toCurrency?: string; since?: string; take?: string },
  ) {
    const take = Math.min(500, Math.max(1, Number(query.take) || 100));
    const where: any = {
      OR: [{ organizationId: orgId }, { organizationId: null }],
    };
    if (query.fromCurrency) where.fromCurrency = query.fromCurrency.toUpperCase();
    if (query.toCurrency) where.toCurrency = query.toCurrency.toUpperCase();
    if (query.since) where.asOfDate = { gte: new Date(query.since) };
    return this.prisma.exchangeRate.findMany({
      where,
      orderBy: [{ asOfDate: 'desc' }, { organizationId: 'desc' }],
      take,
    });
  }

  /** Admin-entered rate. Per-org, displaces the day's existing org row. */
  async upsertManualRate(
    orgId: string,
    actor: Actor,
    dto: { fromCurrency: string; toCurrency: string; rate: number; asOfDate?: string; notes?: string },
  ) {
    this.validateCcy(dto.fromCurrency);
    this.validateCcy(dto.toCurrency);
    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('from and to currencies must differ');
    }
    if (!Number.isFinite(dto.rate) || dto.rate <= 0) {
      throw new BadRequestException('rate must be a positive number');
    }
    if (dto.rate > 1_000_000) {
      throw new BadRequestException('rate is implausibly large; check units');
    }
    const asOfDay = startOfUtcDay(dto.asOfDate ? new Date(dto.asOfDate) : new Date());
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.exchangeRate.upsert({
        where: {
          organizationId_fromCurrency_toCurrency_asOfDate: {
            organizationId: orgId,
            fromCurrency: dto.fromCurrency.toUpperCase(),
            toCurrency: dto.toCurrency.toUpperCase(),
            asOfDate: asOfDay,
          },
        },
        update: {
          rate: new Decimal(dto.rate),
          source: 'manual',
          notes: dto.notes,
          enteredBy: actor.userId,
        },
        create: {
          organizationId: orgId,
          fromCurrency: dto.fromCurrency.toUpperCase(),
          toCurrency: dto.toCurrency.toUpperCase(),
          rate: new Decimal(dto.rate),
          asOfDate: asOfDay,
          source: 'manual',
          notes: dto.notes,
          enteredBy: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'fx_rate_set',
          entityType: 'ExchangeRate',
          entityId: row.id,
          changes: {
            from: row.fromCurrency, to: row.toCurrency,
            rate: Number(row.rate.toString()),
            asOfDate: row.asOfDate.toISOString().slice(0, 10),
          } as any,
        },
      });
      return row;
    });
  }

  /**
   * Pull daily rates from Open Exchange Rates (or a mock source). Inserts
   * global rates (orgId = null) so they apply to every org without a local
   * override. No-ops when OXR_APP_ID isn't configured.
   */
  async syncDailyRates(actor?: Actor) {
    const appId = process.env.OXR_APP_ID;
    const base = process.env.OXR_BASE || 'USD';
    if (!appId) {
      return { ok: false, reason: 'OXR_APP_ID not set; daily sync skipped' };
    }
    const asOfDay = startOfUtcDay(new Date());
    // Review #8: short-circuit if today's global rates were already pulled —
    // saves API quota and stops admins inadvertently DoS'ing OXR.
    const existing = await this.prisma.exchangeRate.count({
      where: { organizationId: null, asOfDate: asOfDay, source: 'oxr' },
    });
    if (existing > 0) {
      return { ok: true, cached: true, inserted: 0, existing };
    }
    try {
      // Lazy fetch only when the env is set — we don't pull when unconfigured.
      const res = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${appId}&base=${base}`);
      if (!res.ok) {
        return { ok: false, reason: `OXR responded ${res.status}` };
      }
      const data: any = await res.json();
      const rates: Record<string, number> = data.rates || {};
      let inserted = 0;
      for (const [to, rate] of Object.entries(rates)) {
        if (!CURRENCY_RE.test(to)) continue;
        try {
          // Review #15: composite unique key includes a nullable column.
          // Postgres treats NULL as distinct in unique indexes by default, so
          // `upsert` on the composite key would never match and produce
          // duplicate global rows. Use findFirst + create/update with NULL
          // semantics handled explicitly.
          const existingRow = await this.prisma.exchangeRate.findFirst({
            where: {
              organizationId: null,
              fromCurrency: base,
              toCurrency: to,
              asOfDate: asOfDay,
            },
            select: { id: true },
          });
          if (existingRow) {
            await this.prisma.exchangeRate.update({
              where: { id: existingRow.id },
              data: { rate: new Decimal(rate), source: 'oxr' },
            });
          } else {
            await this.prisma.exchangeRate.create({
              data: {
                fromCurrency: base, toCurrency: to,
                rate: new Decimal(rate), asOfDate: asOfDay, source: 'oxr',
              },
            });
          }
          inserted++;
        } catch { /* skip individual failures */ }
      }
      if (actor) {
        await this.prisma.auditLog.create({
          data: {
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'fx_daily_sync',
            entityType: 'ExchangeRate',
            entityId: 'batch',
            changes: { base, count: inserted } as any,
          },
        });
      }
      return { ok: true, inserted };
    } catch (err: any) {
      return { ok: false, reason: err.message };
    }
  }

  /**
   * Compute the locked rate for an invoice at issue time.
   * Review #13: defensive null-coalesce. Review #7: refuse to lock against a
   * stale rate so we don't quietly book a month-old rate against today's
   * invoice; the caller (invoices service) catches and proceeds without a
   * locked rate, surfacing the gap to operators.
   */
  async lockedRateForInvoice(
    orgId: string,
    invoiceCurrency: string,
    orgBaseCurrency: string,
    asOf: Date = new Date(),
  ): Promise<{ rate: Decimal; asOfDay: Date; baseCurrency: string; ageDays: number } | null> {
    const inv = (invoiceCurrency || '').toUpperCase();
    const base = (orgBaseCurrency || 'ZAR').toUpperCase();
    if (!inv || inv === base) return null;
    const lookup = await this.rateForWithMeta(inv, base, asOf, orgId);
    if (lookup.isStale) {
      throw new NotFoundException(
        `Only stale FX rate available (${lookup.ageDays} day(s) old). Refusing to lock — update the rate first.`,
      );
    }
    return { rate: lookup.rate, asOfDay: lookup.asOfDate, baseCurrency: base, ageDays: lookup.ageDays };
  }

  private validateCcy(c: string) {
    if (!CURRENCY_RE.test((c || '').toUpperCase())) {
      throw new BadRequestException(`Invalid currency code: ${c}`);
    }
  }
}

function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
