'use client';

import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any>('/payments')
      .then((res) => setPayments(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Payments</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Every payment recorded against your invoices.
          </p>
        </div>
        {!loading && payments.length > 0 && (
          <div className="text-right">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Total collected</p>
            <p className="font-display text-heading-sm font-medium text-meadow-green">
              {formatCurrency(total)}
            </p>
          </div>
        )}
      </header>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : payments.length === 0 ? (
            <div className="p-10 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
                <CreditCard className="h-5 w-5 text-graphite" />
              </div>
              <p className="mt-3 text-body text-charcoal-primary font-medium">No payments yet</p>
              <p className="text-caption text-muted-foreground">
                Once residents pay, the activity shows up here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Invoice</th>
                    <th className="px-6 py-3">Unit</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3">Method</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any, idx: number) => (
                    <tr
                      key={p.id}
                      className={cn(
                        'transition-colors hover:bg-stone-surface/50',
                        idx !== payments.length - 1 && 'border-b border-stone-surface',
                      )}
                    >
                      <td className="px-6 py-4 text-graphite">{formatDate(p.createdAt)}</td>
                      <td className="px-6 py-4 font-mono text-[13px] text-charcoal-primary">
                        {p.invoice?.invoiceNumber}
                      </td>
                      <td className="px-6 py-4 text-graphite">
                        Unit {p.invoice?.unit?.unitNumber}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-charcoal-primary">
                        {/*
                         * Always render in the org currency so the column reads
                         * consistently with the Total above. Historical currency
                         * is still on the row (`p.currency`) for audit / FX
                         * reconciliation if we need it later.
                         */}
                        {formatCurrency(Number(p.amount))}
                      </td>
                      <td className="px-6 py-4 capitalize text-graphite">{p.method}</td>
                      <td className="px-6 py-4">
                        <Badge variant="success">{p.status}</Badge>
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
