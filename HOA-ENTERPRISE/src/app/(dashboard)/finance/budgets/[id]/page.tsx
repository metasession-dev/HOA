'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, CheckCircle2, Lock, BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useOrgSettings } from '@/providers/org-settings-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';

const statusBadge: Record<string, 'muted' | 'info' | 'success'> = {
  draft: 'muted', active: 'success', closed: 'info',
};

export default function BudgetDetailPage() {
  const { id } = useParams();
  const confirm = useConfirm();
  const { org } = useOrgSettings();
  const [b, setB] = useState<any>(null);
  const [variance, setVariance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [asOfMonth, setAsOfMonth] = useState<number>(new Date().getUTCMonth() + 1);

  // Render every money figure in the org's *current* currency from settings,
  // not the currency that was historically stamped on the budget row. This
  // matches the Payments page behaviour and is what users expect: change the
  // currency in /settings and every finance view follows.
  //
  // The budget's persisted `currency` field stays unchanged for audit, but is
  // only surfaced as a small "Saved as X" note when it diverges from the live
  // org currency.
  const displayCurrency = org.currency;
  const savedDiffers = b && b.currency && b.currency !== displayCurrency;

  const load = async () => {
    setLoading(true);
    try {
      const [bRes, vRes] = await Promise.all([
        api.get<any>(`/finance/budgets/${id}`),
        api.get<any>(`/finance/budgets/${id}/variance?asOfMonth=${asOfMonth}`),
      ]);
      setB(bRes.data);
      setVariance(vRes.data);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, asOfMonth]);

  const activate = async () => {
    const ok = await confirm({
      title: 'Activate budget?',
      description: 'Only one budget can be active per fiscal year + fund. Others active in this scope will block this transition.',
      confirmText: 'Activate',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/finance/budgets/${id}/transition`, { target: 'active' });
      toast({ variant: 'success', title: 'Budget activated' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Activate failed', description: err.message });
    } finally { setBusy(false); }
  };

  const close = async () => {
    const ok = await confirm({
      title: 'Close budget?',
      description: 'Closed budgets are read-only and remain in the audit trail.',
      confirmText: 'Close',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/finance/budgets/${id}/transition`, { target: 'closed' });
      toast({ variant: 'success', title: 'Budget closed' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Close failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!b) return <Card><CardContent className="p-10 text-center"><p>Not found.</p></CardContent></Card>;

  return (
    <div className="space-y-6">
      <Link href="/finance/budgets" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Budgets
      </Link>

      <header>
        <div className="flex items-center gap-2">
          <Badge variant={statusBadge[b.status] || 'muted'}>{b.status}</Badge>
          {b.fund && <Badge variant="muted">Fund: {b.fund.name}</Badge>}
        </div>
        <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">{b.name}</h1>
        <p className="mt-1 text-body text-muted-foreground">
          FY {b.fiscalYear} · {b.lines.length} line{b.lines.length === 1 ? '' : 's'} · {displayCurrency}
          {savedDiffers && (
            <span className="ml-2 text-caption text-muted-foreground/70">(saved as {b.currency})</span>
          )}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {b.status === 'draft' && <Button disabled={busy} onClick={activate}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Activate</Button>}
        {b.status === 'active' && <Button variant="secondary" disabled={busy} onClick={close}><Lock className="mr-1.5 h-3.5 w-3.5" />Close</Button>}
      </div>

      {variance && (
        <Card><CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />Variance
              </h3>
              <p className="text-caption text-muted-foreground">Budget vs actuals through month {asOfMonth} of FY {b.fiscalYear}</p>
            </div>
            <select value={asOfMonth} onChange={(e) => setAsOfMonth(Number(e.target.value))}
              className="h-9 rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Through month {m}</option>)}
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-4 mb-4">
            <Stat label="Budgeted YTD" value={formatCurrency(variance.totals.budgeted, displayCurrency)} />
            <Stat label="Actual YTD" value={formatCurrency(variance.totals.actual, displayCurrency)} />
            <Stat label="Variance" value={formatCurrency(variance.totals.variance, displayCurrency)} highlight={variance.totals.variance < 0} />
            <Stat label="Variance %" value={variance.totals.variancePct !== null ? `${variance.totals.variancePct.toFixed(1)}%` : '—'} highlight={(variance.totals.variancePct ?? 0) < 0} />
          </div>

          <div className="overflow-x-auto rounded-lg bg-stone-surface/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption text-muted-foreground">
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">Budgeted YTD</th>
                  <th className="px-3 py-2 text-right">Actual YTD</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                  <th className="px-3 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {variance.lines.map((l: any) => (
                  <tr key={l.glAccountId} className={cn('border-t border-stone-surface', l.orphaned && 'opacity-60')}>
                    <td className="px-3 py-2 text-graphite">
                      <span className="font-mono text-muted-foreground text-[12px]">{l.code}</span> · {l.name}{' '}
                      <span className="text-caption text-muted-foreground">({l.type})</span>
                      {l.orphaned && (
                        <Badge variant="destructive" className="ml-2 text-[10px]">linked GL deleted</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-graphite">{formatCurrency(l.budgeted, displayCurrency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-graphite">{formatCurrency(l.actual, displayCurrency)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-medium', l.variance < 0 ? 'text-coral-red' : 'text-meadow-green')}>{formatCurrency(l.variance, displayCurrency)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', (l.variancePct ?? 0) < 0 ? 'text-coral-red' : 'text-meadow-green')}>{l.variancePct !== null ? l.variancePct.toFixed(1) + '%' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent></Card>
      )}

      {b.notes && (
        <Card><CardContent className="p-6">
          <p className="text-caption text-muted-foreground mb-1">Notes</p>
          <p className="text-sm text-graphite whitespace-pre-wrap">{b.notes}</p>
        </CardContent></Card>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className={cn('tabular-nums font-display text-heading-sm', highlight ? 'text-coral-red' : 'text-charcoal-primary')}>{value}</p>
    </div>
  );
}
