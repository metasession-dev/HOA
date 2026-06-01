'use client';

/**
 * Resident invoices summary — outstanding/paid headline figures, a paid-over-time
 * chart, and a payments-by-billing-type breakdown.
 *
 * Figures come from `GET /invoices/stats`, which is scoped server-side to the
 * signed-in resident's units, so this reflects their whole history (not just the
 * paginated list below it).
 */
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Wallet, CheckCircle2, Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Series = { period: string; label: string; total: number; paid: number; unpaid: number; count: number };
type ByType = { key: string; name: string; billed: number; paid: number; outstanding: number; count: number };
type Stats = {
  totals: { count: number; amount: number; paid: number; outstanding: number; paidCount: number; unpaidCount: number; overdueCount: number };
  series: Series[];
  byBillingType: ByType[];
};

const COLOR = { billed: '#9b9a98', paid: '#00ca48' };

function compact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${n}`;
}

export function InvoiceStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/invoices/stats')
      .then((r) => setStats(r.data))
      .catch(() => { /* best-effort; the list below still works */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }
  if (!stats || stats.totals.count === 0) return null;

  const { totals, series, byBillingType } = stats;
  const hasSeries = series.some((s) => s.paid > 0 || s.total > 0);
  const maxBilled = Math.max(1, ...byBillingType.map((t) => t.billed));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric
          icon={<Wallet className="h-4 w-4" />}
          label="Outstanding"
          value={formatCurrency(totals.outstanding)}
          hint={`${totals.unpaidCount} unpaid${totals.overdueCount ? ` · ${totals.overdueCount} overdue` : ''}`}
          accent="ember"
        />
        <Metric
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Paid to date"
          value={formatCurrency(totals.paid)}
          hint={`${totals.paidCount} invoice(s) settled`}
          accent="green"
        />
        <Metric
          icon={<Receipt className="h-4 w-4" />}
          label="Total billed"
          value={formatCurrency(totals.amount)}
          hint={`${totals.count} invoice(s)`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Paid over time */}
        <Card className="lg:col-span-3">
          <CardContent className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-heading-sm text-charcoal-primary">Payments over time</h2>
                <p className="text-caption text-muted-foreground">Billed vs paid, by month.</p>
              </div>
              <div className="flex items-center gap-3 text-caption text-muted-foreground">
                <LegendDot color={COLOR.billed} label="Billed" />
                <LegendDot color={COLOR.paid} label="Paid" />
              </div>
            </div>
            {!hasSeries ? (
              <div className="flex h-56 items-center justify-center text-caption text-muted-foreground">
                No invoices in the last 12 months yet.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="26%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--c-graphite)" strokeOpacity={0.12} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--c-graphite)' }} tickLine={false} axisLine={{ stroke: 'var(--c-graphite)', strokeOpacity: 0.2 }} />
                    <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: 'var(--c-graphite)' }} tickLine={false} axisLine={false} width={44} />
                    <Tooltip
                      cursor={{ fill: 'var(--c-graphite)', fillOpacity: 0.06 }}
                      formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
                      contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                      labelStyle={{ fontWeight: 600, color: 'var(--c-charcoal-primary)' }}
                    />
                    <Bar dataKey="total" name="Billed" fill={COLOR.billed} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="paid" name="Paid" fill={COLOR.paid} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payments by billing type */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h2 className="font-display text-heading-sm text-charcoal-primary">Payments by billing type</h2>
            <p className="text-caption text-muted-foreground">How much you&rsquo;ve paid against each charge.</p>
            <ul className="mt-4 space-y-3">
              {byBillingType.map((t) => {
                const pct = t.billed > 0 ? Math.round((t.paid / t.billed) * 100) : 0;
                return (
                  <li key={t.key} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-charcoal-primary">{t.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        <span className="font-medium text-charcoal-primary">{formatCurrency(t.paid)}</span>
                        {' / '}{formatCurrency(t.billed)}
                      </span>
                    </div>
                    <div className="relative h-2 overflow-hidden rounded-full bg-stone-surface" title={`${pct}% paid`}>
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${Math.max((t.billed / maxBilled) * 100, 2)}%`, backgroundColor: COLOR.billed, opacity: 0.45 }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${(t.paid / maxBilled) * 100}%`, backgroundColor: COLOR.paid }}
                      />
                    </div>
                    {t.outstanding > 0.005 && (
                      <p className="text-caption text-muted-foreground">{formatCurrency(t.outstanding)} outstanding</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, hint, accent }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; accent?: 'green' | 'ember';
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-caption uppercase tracking-wider text-muted-foreground">
          <span className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-lg',
            accent === 'green' ? 'bg-[#00ca48]/10 text-[#00a13a]'
              : accent === 'ember' ? 'bg-ember-orange/10 text-ember-orange'
                : 'bg-stone-surface text-graphite',
          )}>
            {icon}
          </span>
          {label}
        </div>
        <p className="mt-2 text-heading-md font-semibold tabular-nums text-charcoal-primary">{value}</p>
        {hint && <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
