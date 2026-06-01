'use client';

/**
 * Invoices dashboard — headline metrics + a billed/paid/outstanding time series.
 *
 * Figures come from the server (`GET /invoices/stats`), aggregated across ALL
 * invoices in scope (not just the current list page) and excluding voided ones,
 * so the totals are authoritative rather than computed off one paginated page.
 */
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { FileText, Banknote, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Series = { period: string; label: string; total: number; paid: number; unpaid: number; count: number };
type Stats = {
  totals: { count: number; amount: number; paid: number; outstanding: number; paidCount: number; unpaidCount: number; overdueCount: number };
  series: Series[];
};

// Theme colours (globals.css): charcoal / valid-green / ember-orange.
const COLOR = { total: '#343433', paid: '#00ca48', unpaid: '#ff3e00' };

// Compact axis labels — e.g. R1.2M, R45k — to keep the Y axis readable.
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
      .catch(() => { /* dashboard is best-effort; the list below still works */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }
  if (!stats) return null;

  const { totals, series } = stats;
  const hasSeries = series.some((s) => s.count > 0);
  const collectionRate = totals.amount > 0 ? Math.round((totals.paid / totals.amount) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={<FileText className="h-4 w-4" />}
          label="Total invoices"
          value={totals.count.toLocaleString()}
          hint={`${formatCurrency(totals.amount)} billed`}
        />
        <Metric
          icon={<Banknote className="h-4 w-4" />}
          label="Total billed"
          value={formatCurrency(totals.amount)}
          hint="excludes voided"
        />
        <Metric
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Paid"
          value={formatCurrency(totals.paid)}
          hint={`${totals.paidCount} settled · ${collectionRate}% collected`}
          accent="green"
        />
        <Metric
          icon={<AlertCircle className="h-4 w-4" />}
          label="Outstanding"
          value={formatCurrency(totals.outstanding)}
          hint={`${totals.unpaidCount} open${totals.overdueCount ? ` · ${totals.overdueCount} overdue` : ''}`}
          accent="ember"
        />
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-heading-sm text-charcoal-primary">Invoice payments over time</h2>
              <p className="text-caption text-muted-foreground">Billed vs collected vs outstanding, by month.</p>
            </div>
            <div className="flex items-center gap-3 text-caption text-muted-foreground">
              <LegendDot color={COLOR.total} label="Billed" />
              <LegendDot color={COLOR.paid} label="Paid" />
              <LegendDot color={COLOR.unpaid} label="Outstanding" />
            </div>
          </div>
          {!hasSeries ? (
            <div className="flex h-64 items-center justify-center text-caption text-muted-foreground">
              No invoices in the last 12 months yet.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--c-graphite)" strokeOpacity={0.12} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--c-graphite)' }} tickLine={false} axisLine={{ stroke: 'var(--c-graphite)', strokeOpacity: 0.2 }} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: 'var(--c-graphite)' }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    cursor={{ fill: 'var(--c-graphite)', fillOpacity: 0.06 }}
                    formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                    labelStyle={{ fontWeight: 600, color: 'var(--c-charcoal-primary)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="total" name="Billed" fill={COLOR.total} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="paid" name="Paid" fill={COLOR.paid} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="unpaid" name="Outstanding" fill={COLOR.unpaid} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
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
