'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { residentInvoiceStatus } from '@/lib/invoice-status';
import { useListControls, ListToolbar, ListPager } from '@/components/ui/list-controls';

const selectClass = cn(
  'flex h-10 rounded-lg border border-stone-surface bg-card px-3 text-sm text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
);

export default function MyInvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Billing-type filter — '' = all, 'none' = ad-hoc/unlinked, else a catalog id.
  // Residents can't read the org catalog, so options are derived from their own
  // invoices' linked billing types.
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    api
      .get<any>('/invoices')
      .then((res) => setInvoices(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Distinct billing types present on the resident's invoices, for the filter.
  const billingTypeOptions = Array.from(
    new Map(invoices.filter((i) => i.billingType).map((i) => [i.billingType.id, i.billingType.name])),
  ).map(([id, name]) => ({ id, name }));
  const hasUnlinked = invoices.some((i) => !i.billingType);

  const visibleInvoices = typeFilter
    ? invoices.filter((i) => (typeFilter === 'none' ? !i.billingType : i.billingType?.id === typeFilter))
    : invoices;

  // Balance is server-authoritative: amount − amountPaid (the maintained ledger
  // cache). Never just sum invoice amounts — that ignores partial payments.
  const c = useListControls(visibleInvoices, {
    searchText: (i: any) => `${i.invoiceNumber ?? ''} ${i.unit?.unitNumber ?? ''} ${i.unit?.estate?.name ?? ''} ${i.status ?? ''} ${i.billingType?.name ?? ''}`,
    date: (i: any) => i.dueDate,
  });

  const outstanding = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'voided')
    .reduce((sum, i) => sum + Math.max(Number(i.amount || 0) - Number(i.amountPaid || 0), 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">My invoices</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Invoices issued to your unit(s).
        </p>
      </header>

      {!loading && invoices.length > 0 && (
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-caption uppercase tracking-wider text-muted-foreground">
                Outstanding
              </p>
              <p className="mt-1 font-display text-heading-lg font-medium text-charcoal-primary">
                {formatCurrency(outstanding)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-caption text-muted-foreground">Total invoices</p>
              <p className="text-heading-sm font-medium text-charcoal-primary">{invoices.length}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && invoices.length > 0 && (
        <ListToolbar c={c} searchPlaceholder="Search by number, unit or status">
          {(billingTypeOptions.length > 0 || hasUnlinked) && (
            <select
              className={selectClass}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              title="Filter by billing type"
            >
              <option value="">All billing types</option>
              {billingTypeOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              {hasUnlinked && <option value="none">Other / ad-hoc</option>}
            </select>
          )}
        </ListToolbar>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-10 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
                <Receipt className="h-5 w-5 text-graphite" />
              </div>
              <p className="mt-3 text-body text-charcoal-primary font-medium">No invoices yet</p>
              <p className="text-caption text-muted-foreground">
                When your HOA issues an invoice, it will appear here.
              </p>
            </div>
          ) : c.total === 0 ? (
            <div className="p-10 text-center text-caption text-muted-foreground">No invoices match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Invoice</th>
                    <th className="px-6 py-3">Unit</th>
                    <th className="px-6 py-3">Charge</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3">Due</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {c.pageItems.map((inv: any, idx: number) => (
                    <tr
                      key={inv.id}
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-stone-surface/50',
                        idx !== c.pageItems.length - 1 && 'border-b border-stone-surface',
                      )}
                      onClick={() => router.push(`/invoices/${inv.id}`)}
                    >
                      <td className="px-6 py-4 font-mono text-[13px] text-charcoal-primary">
                        <Link href={`/invoices/${inv.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-graphite">
                        Unit {inv.unit?.unitNumber}
                        <span className="text-muted-foreground"> · {inv.unit?.estate?.name}</span>
                      </td>
                      <td className="px-6 py-4">
                        {inv.billingType?.name
                          ? <Badge variant="secondary">{inv.billingType.name}</Badge>
                          : <span className="text-caption text-muted-foreground">{inv.type || 'ad-hoc'}</span>}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-charcoal-primary">
                        {formatCurrency(Number(inv.amount))}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                      <td className="px-6 py-4">
                        <Badge variant={residentInvoiceStatus(inv.status).variant}>{residentInvoiceStatus(inv.status).label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && invoices.length > 0 && <ListPager c={c} />}
    </div>
  );
}
