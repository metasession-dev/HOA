'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function IncomeStatementView({ data, compact }: { data: any; compact?: boolean }) {
  return (
    <Card><CardContent className={compact ? 'p-4' : 'p-6'}>
      <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-4">Income Statement</h3>
      <Section title="Income" accounts={data.income.accounts} total={data.income.total} currency={data.currency} />
      <Section title="Expenses" accounts={data.expenses.accounts} total={data.expenses.total} currency={data.currency} />
      <div className="mt-4 pt-3 border-t border-stone-surface flex items-center justify-between">
        <p className="text-sm font-display font-medium text-charcoal-primary">Net surplus / (deficit)</p>
        <p className={cn('text-heading-sm font-display tabular-nums', data.netSurplus >= 0 ? 'text-meadow-green' : 'text-coral-red')}>
          {data.currency} {Math.abs(data.netSurplus).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          {data.netSurplus < 0 && ' (deficit)'}
        </p>
      </div>
    </CardContent></Card>
  );
}

export function BalanceSheetView({ data, compact }: { data: any; compact?: boolean }) {
  return (
    <Card><CardContent className={compact ? 'p-4' : 'p-6'}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Balance Sheet</h3>
        {!data.balanced && <Badge variant="destructive">Out of balance</Badge>}
      </div>
      <Section title="Assets" accounts={data.assets.accounts} total={data.assets.total} currency={data.currency} />
      <Section title="Liabilities" accounts={data.liabilities.accounts} total={data.liabilities.total} currency={data.currency} />
      <Section title="Equity" accounts={data.equity.accounts} total={data.equity.total} currency={data.currency} />
      <div className="rounded-lg bg-stone-surface/50 p-3 mt-2 flex items-center justify-between">
        <p className="text-sm text-graphite">Retained surplus</p>
        <p className="text-sm tabular-nums text-graphite">{data.currency} {data.retainedSurplus.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      </div>
      <div className="mt-4 pt-3 border-t border-stone-surface flex items-center justify-between">
        <p className="text-sm font-display font-medium text-charcoal-primary">Total Liabilities + Equity</p>
        <p className="text-heading-sm font-display tabular-nums text-charcoal-primary">
          {data.currency} {data.totalLiabilitiesAndEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    </CardContent></Card>
  );
}

export function CashFlowView({ data, compact }: { data: any; compact?: boolean }) {
  const block = (label: string, b: any) => (
    <div className="mb-4">
      <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      <div className="rounded-lg bg-stone-surface/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-caption text-muted-foreground">
            <tr><th className="px-3 py-2">Account</th><th className="px-3 py-2 text-right">Inflows</th><th className="px-3 py-2 text-right">Outflows</th><th className="px-3 py-2 text-right">Net</th></tr>
          </thead>
          <tbody>
            {b.categories.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-2 text-muted-foreground italic">No activity</td></tr>
            ) : b.categories.map((c: any) => (
              <tr key={c.accountId} className="border-t border-stone-surface">
                <td className="px-3 py-2 text-graphite">{c.code} · {c.name}</td>
                <td className="px-3 py-2 text-right text-meadow-green tabular-nums">{c.inflows > 0 ? c.inflows.toFixed(2) : '—'}</td>
                <td className="px-3 py-2 text-right text-coral-red tabular-nums">{c.outflows > 0 ? c.outflows.toFixed(2) : '—'}</td>
                <td className={cn('px-3 py-2 text-right font-medium tabular-nums', c.net >= 0 ? 'text-meadow-green' : 'text-coral-red')}>{c.net.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="border-t border-stone-surface bg-card">
              <td className="px-3 py-2 font-medium text-graphite">Subtotal</td>
              <td className="px-3 py-2 text-right tabular-nums text-meadow-green">{b.inflows.toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-coral-red">{b.outflows.toFixed(2)}</td>
              <td className={cn('px-3 py-2 text-right font-medium tabular-nums', b.net >= 0 ? 'text-meadow-green' : 'text-coral-red')}>{b.net.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <Card><CardContent className={compact ? 'p-4' : 'p-6'}>
      <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-4">Cash Flow Statement</h3>
      {block('Operating activities', data.operating)}
      {block('Investing activities', data.investing)}
      {block('Financing activities', data.financing)}
      <div className="grid gap-3 md:grid-cols-3 pt-3 border-t border-stone-surface">
        <Stat label="Opening cash" value={`${data.currency} ${data.openingCash.toFixed(2)}`} />
        <Stat label="Net change" value={`${data.currency} ${data.netChange.toFixed(2)}`} highlight={data.netChange < 0} />
        <Stat label="Closing cash" value={`${data.currency} ${data.closingCash.toFixed(2)}`} big />
      </div>
    </CardContent></Card>
  );
}

function Section({ title, accounts, total, currency }: { title: string; accounts: any[]; total: number; currency: string }) {
  return (
    <div className="mb-4">
      <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1">
        {accounts.length === 0 ? (
          <p className="text-caption text-muted-foreground italic">No activity in this period</p>
        ) : accounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between py-1 text-sm">
            <span className="text-graphite"><span className="font-mono text-muted-foreground text-[12px]">{a.code}</span> · {a.name}</span>
            <span className="tabular-nums text-graphite">{currency} {a.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-stone-surface">
          <span className="text-sm font-medium text-charcoal-primary">Total {title}</span>
          <span className="text-sm font-medium tabular-nums text-charcoal-primary">{currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, big, highlight }: { label: string; value: string; big?: boolean; highlight?: boolean }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className={cn(big ? 'text-heading-sm font-display' : 'text-sm', 'tabular-nums', highlight ? 'text-coral-red' : 'text-charcoal-primary')}>{value}</p>
    </div>
  );
}
