'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { IncomeStatementView, BalanceSheetView, CashFlowView } from './statement-views';

type ReportView = 'collections' | 'arrears' | 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow';

const tabs: Array<{ id: ReportView; label: string }> = [
  { id: 'collections', label: 'Collections' },
  { id: 'income-statement', label: 'Income statement' },
  { id: 'balance-sheet', label: 'Balance sheet' },
  { id: 'cash-flow', label: 'Cash flow' },
  { id: 'arrears', label: 'Arrears' },
  { id: 'trial-balance', label: 'Trial balance' },
];

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getUTCFullYear()}-01-01`;

export default function ReportsPage() {
  const [view, setView] = useState<ReportView>('collections');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());

  useEffect(() => {
    setLoading(true);
    // Clear stale data so a view-shape mismatch doesn't crash the next view's render
    setData(null);
    let url = '';
    if (view === 'collections') url = `/finance/reports/collections?from=${from}&to=${to}`;
    else if (view === 'arrears') url = '/finance/reports/arrears';
    else if (view === 'trial-balance') url = '/finance/reports/trial-balance';
    else if (view === 'income-statement') url = `/finance/reports/income-statement?from=${from}&to=${to}`;
    else if (view === 'balance-sheet') url = `/finance/reports/balance-sheet?asOf=${asOf}`;
    else if (view === 'cash-flow') url = `/finance/reports/cash-flow?from=${from}&to=${to}`;
    api.get<any>(url).then((r) => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, [view, from, to, asOf]);

  const needsRange = view === 'income-statement' || view === 'cash-flow' || view === 'collections';
  const needsAsOf = view === 'balance-sheet';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Financial reports</h1>
          <p className="mt-1 text-body text-muted-foreground">Statements, arrears, trial balance.</p>
        </div>
        <Link href={`/finance/reports/board-pack?from=${from}&to=${to}`}>
          <Button><FileText className="mr-1.5 h-4 w-4" />Board pack</Button>
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-pill bg-stone-surface p-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setData(null); setLoading(true); setView(t.id); }}
              className={cn('rounded-pill px-3 py-1.5 text-sm font-medium transition-colors',
                view === t.id ? 'bg-card text-charcoal-primary shadow-inset-stone' : 'text-muted-foreground hover:text-graphite')}>
              {t.label}
            </button>
          ))}
        </div>
        {needsRange && (
          <div className="flex items-center gap-2 ml-auto">
            <Label className="text-caption text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" />
            <Label className="text-caption text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" />
          </div>
        )}
        {needsAsOf && (
          <div className="flex items-center gap-2 ml-auto">
            <Label className="text-caption text-muted-foreground">As of</Label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9 w-36" />
          </div>
        )}
      </div>

      {loading ? (
        <Card><CardContent className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</CardContent></Card>
      ) : view === 'collections' && data ? (
        <CollectionsView data={data} />
      ) : view === 'income-statement' && data ? (
        <IncomeStatementView data={data} />
      ) : view === 'balance-sheet' && data ? (
        <BalanceSheetView data={data} />
      ) : view === 'cash-flow' && data ? (
        <CashFlowView data={data} />
      ) : view === 'arrears' ? (
        <ArrearsView data={data || []} />
      ) : view === 'trial-balance' ? (
        <TrialBalanceView data={data || []} />
      ) : null}
    </div>
  );
}

function CollectionsView({ data }: { data: any }) {
  const t = data.totals;
  const defaulters: any[] = data.defaulters || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CollStat label="Billed" value={formatCurrency(t.billed)} hint={`${t.invoiceCount} invoice(s)`} />
        <CollStat label="Collected" value={formatCurrency(t.collected)} hint={`${t.collectionRate}% collection rate`} tone="green" />
        <CollStat label="Outstanding" value={formatCurrency(t.outstanding)} hint={`${t.defaulterUnits} unit(s) owing`} tone="red" />
        <CollStat label="Collection rate" value={`${t.collectionRate}%`} hint={`${data.period.from} → ${data.period.to}`} />
      </div>

      {/* Collected-vs-outstanding progress bar */}
      <Card><CardContent className="p-5">
        <div className="mb-2 flex items-center justify-between text-caption text-muted-foreground">
          <span>Collected {formatCurrency(t.collected)}</span>
          <span>Outstanding {formatCurrency(t.outstanding)}</span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-stone-surface">
          <div className="h-full bg-meadow-green" style={{ width: `${t.collectionRate}%` }} />
          <div className="h-full bg-coral-red" style={{ width: `${Math.max(0, 100 - t.collectionRate)}%` }} />
        </div>
      </CardContent></Card>

      {/* Defaulters */}
      <div>
        <h2 className="mb-2 font-display text-heading-sm text-charcoal-primary">Residents with outstanding balances</h2>
        {defaulters.length === 0 ? (
          <Card><CardContent className="p-10 text-center">
            <p className="text-body font-medium text-charcoal-primary">Everyone&rsquo;s paid up</p>
            <p className="text-caption text-muted-foreground">No outstanding balances for invoices issued in this period.</p>
          </CardContent></Card>
        ) : (
          <Card><CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Resident</th><th className="px-6 py-3">Unit</th>
                    <th className="px-6 py-3 text-right">Billed</th><th className="px-6 py-3 text-right">Paid</th>
                    <th className="px-6 py-3 text-right">Outstanding</th><th className="px-6 py-3 text-right">Invoices</th>
                    <th className="px-6 py-3 text-right">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {defaulters.map((d, idx) => (
                    <tr key={d.unitId} className={cn('hover:bg-stone-surface/50', idx !== defaulters.length - 1 && 'border-b border-stone-surface')}>
                      <td className="px-6 py-3 text-charcoal-primary font-medium">{d.resident}</td>
                      <td className="px-6 py-3 text-graphite">Unit {d.unitNumber}<span className="text-muted-foreground"> · {d.estateName}</span></td>
                      <td className="px-6 py-3 text-right text-graphite">{formatCurrency(d.billed)}</td>
                      <td className="px-6 py-3 text-right text-meadow-green">{formatCurrency(d.collected)}</td>
                      <td className="px-6 py-3 text-right font-medium text-coral-red">{formatCurrency(d.outstanding)}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground tabular-nums">{d.invoiceCount}</td>
                      <td className="px-6 py-3 text-right">
                        {d.daysOverdue > 0
                          ? <span className="rounded-full bg-coral-red/10 px-2 py-0.5 text-[11px] font-medium text-coral-red">{d.daysOverdue}d</span>
                          : <span className="text-caption text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function CollStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'green' | 'red' }) {
  return (
    <Card><CardContent className="p-5">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-heading-md font-semibold tabular-nums',
        tone === 'green' ? 'text-meadow-green' : tone === 'red' ? 'text-coral-red' : 'text-charcoal-primary')}>{value}</p>
      {hint && <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>}
    </CardContent></Card>
  );
}

function ArrearsView({ data }: { data: any[] }) {
  if (data.length === 0) {
    return <Card><CardContent className="p-10 text-center"><p className="text-body text-charcoal-primary font-medium">All up to date</p><p className="text-caption text-muted-foreground">No overdue invoices.</p></CardContent></Card>;
  }
  return (
    <Card><CardContent className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3">Invoice</th><th className="px-6 py-3">Unit</th><th className="px-6 py-3">Resident</th>
              <th className="px-6 py-3 text-right">Amount</th><th className="px-6 py-3 text-right">Paid</th>
              <th className="px-6 py-3 text-right">Outstanding</th><th className="px-6 py-3 text-right">Days</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item: any, idx: number) => (
              <tr key={item.invoiceId} className={cn('hover:bg-stone-surface/50', idx !== data.length - 1 && 'border-b border-stone-surface')}>
                <td className="px-6 py-3 font-mono text-[13px] text-charcoal-primary">{item.invoiceNumber}</td>
                <td className="px-6 py-3 text-graphite">Unit {item.unitNumber}</td>
                <td className="px-6 py-3 text-graphite">{item.resident}</td>
                <td className="px-6 py-3 text-right text-graphite">{formatCurrency(item.amount)}</td>
                <td className="px-6 py-3 text-right text-meadow-green">{formatCurrency(item.paid)}</td>
                <td className="px-6 py-3 text-right font-medium text-coral-red">{formatCurrency(item.outstanding)}</td>
                <td className="px-6 py-3 text-right"><span className="rounded-full bg-coral-red/10 px-2 py-0.5 text-[11px] font-medium text-coral-red">{item.daysOverdue}d</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent></Card>
  );
}

function TrialBalanceView({ data }: { data: any[] }) {
  return (
    <Card><CardContent className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3">Code</th><th className="px-6 py-3">Account</th><th className="px-6 py-3">Type</th>
              <th className="px-6 py-3 text-right">Debit</th><th className="px-6 py-3 text-right">Credit</th><th className="px-6 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a: any, idx: number) => (
              <tr key={a.id} className={cn('hover:bg-stone-surface/50', idx !== data.length - 1 && 'border-b border-stone-surface')}>
                <td className="px-6 py-3 font-mono text-[13px] text-charcoal-primary">{a.code}</td>
                <td className="px-6 py-3 text-graphite">{a.name}</td>
                <td className="px-6 py-3 capitalize text-muted-foreground">{a.type}</td>
                <td className="px-6 py-3 text-right text-graphite">{a.debit > 0 ? formatCurrency(a.debit) : '—'}</td>
                <td className="px-6 py-3 text-right text-graphite">{a.credit > 0 ? formatCurrency(a.credit) : '—'}</td>
                <td className="px-6 py-3 text-right font-medium text-charcoal-primary">{formatCurrency(Math.abs(a.balance))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent></Card>
  );
}

