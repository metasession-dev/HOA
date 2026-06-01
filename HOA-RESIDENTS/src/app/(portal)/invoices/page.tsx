'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, getOrgCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { residentInvoiceStatus } from '@/lib/invoice-status';

export default function MyInvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any>('/invoices')
      .then((res) => setInvoices(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Balance is server-authoritative: amount − amountPaid (the maintained ledger
  // cache). Never just sum invoice amounts — that ignores partial payments.
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
                {formatCurrency(outstanding, invoices[0]?.currency || getOrgCurrency())}
              </p>
            </div>
            <div className="text-right">
              <p className="text-caption text-muted-foreground">Total invoices</p>
              <p className="text-heading-sm font-medium text-charcoal-primary">{invoices.length}</p>
            </div>
          </CardContent>
        </Card>
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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Invoice</th>
                    <th className="px-6 py-3">Unit</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3">Due</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any, idx: number) => (
                    <tr
                      key={inv.id}
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-stone-surface/50',
                        idx !== invoices.length - 1 && 'border-b border-stone-surface',
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
                      <td className="px-6 py-4 text-right font-medium text-charcoal-primary">
                        {formatCurrency(Number(inv.amount), inv.currency)}
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
    </div>
  );
}
