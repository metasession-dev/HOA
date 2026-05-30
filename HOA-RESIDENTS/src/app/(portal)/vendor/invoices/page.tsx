'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Receipt, Plus, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

const statusBadgeMap: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  captured: 'muted',
  pending_approval: 'warning',
  approved: 'info',
  paid: 'success',
  rejected: 'destructive',
  cancelled: 'secondary',
};

const statusLabel: Record<string, string> = {
  captured: 'Received',
  pending_approval: 'In review',
  approved: 'Approved',
  paid: 'Paid',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function VendorInvoicesPage() {
  const [me, setMe] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<any>('/vendor-portal/me').then((r) => setMe(r.data)).catch(() => {}),
      api.get<any>('/vendor-portal/invoices').then((r) => setInvoices(r.data || [])).catch(console.error),
    ]).finally(() => setLoading(false));
  }, []);

  const restricted = me && me.status !== 'active';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-caption uppercase tracking-[0.16em] text-muted-foreground">
            {me?.name || 'Vendor portal'}
          </p>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">My invoices</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Submit invoices and track their approval and payment status.
          </p>
        </div>
        {!restricted && (
          <Button asChild>
            <Link href="/vendor/invoices/new">
              <Plus className="mr-1 h-4 w-4" />
              Submit invoice
            </Link>
          </Button>
        )}
      </header>

      {restricted && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-coral-red" />
            <div>
              <p className="text-body font-medium text-charcoal-primary">
                Your vendor account is {me.status}
              </p>
              <p className="text-caption text-muted-foreground">
                You can&apos;t submit new invoices right now. Please contact the HOA office.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-10 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
                <Receipt className="h-5 w-5 text-graphite" />
              </div>
              <p className="mt-3 text-body font-medium text-charcoal-primary">No invoices yet</p>
              <p className="text-caption text-muted-foreground">
                Submit your first invoice and it will appear here with its status.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Invoice</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3">Issued</th>
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
                      onClick={() => window.location.assign(`/vendor/invoices/${inv.id}`)}
                    >
                      <td className="px-6 py-4 font-mono text-[13px] text-charcoal-primary">
                        <Link
                          href={`/vendor/invoices/${inv.id}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {inv.vendorInvoiceNo}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-charcoal-primary">
                        {formatCurrency(Number(inv.amount), inv.currency)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                      <td className="px-6 py-4">
                        <Badge variant={statusBadgeMap[inv.status] || 'secondary'}>
                          {statusLabel[inv.status] || inv.status}
                        </Badge>
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
