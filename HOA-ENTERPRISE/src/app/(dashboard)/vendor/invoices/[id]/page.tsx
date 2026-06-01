'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, FileText, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadAttachment } from '@/lib/files';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function VendorInvoiceDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [inv, setInv] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.get<any>(`/vendor-portal/invoices/${id}`)
      .then((r) => setInv(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="space-y-6">
      <Link
        href="/vendor/invoices"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        My invoices
      </Link>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40" />
        </div>
      ) : !inv ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">Invoice not found.</CardContent>
        </Card>
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
                {inv.vendorInvoiceNo}
              </h1>
              <p className="mt-1 font-display text-heading-sm font-medium text-charcoal-primary">
                {formatCurrency(Number(inv.amount), inv.currency)}
              </p>
            </div>
            <Badge variant={statusBadgeMap[inv.status] || 'secondary'}>
              {statusLabel[inv.status] || inv.status}
            </Badge>
          </header>

          {inv.status === 'rejected' && inv.rejectedReason && (
            <Card>
              <CardContent className="p-4">
                <p className="text-caption uppercase tracking-wider text-muted-foreground">Reason for rejection</p>
                <p className="mt-1 text-body text-charcoal-primary">{inv.rejectedReason}</p>
              </CardContent>
            </Card>
          )}

          {inv.status === 'paid' && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                <div>
                  <p className="text-body font-medium text-charcoal-primary">Paid{inv.paidAt ? ` on ${formatDate(inv.paidAt)}` : ''}</p>
                  {inv.paymentReference && (
                    <p className="text-caption text-muted-foreground">Reference: {inv.paymentReference}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              <Detail label="Issued" value={formatDate(inv.issueDate)} />
              <Detail label="Due" value={formatDate(inv.dueDate)} />
              <Detail label="Amount" value={formatCurrency(Number(inv.amount), inv.currency)} />
              {inv.vatAmount != null && (
                <Detail label="VAT" value={formatCurrency(Number(inv.vatAmount), inv.currency)} />
              )}
              {inv.notes && <Detail label="Notes" value={inv.notes} full />}
            </CardContent>
          </Card>

          {Array.isArray(inv.attachments) && inv.attachments.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <p className="mb-3 text-caption uppercase tracking-wider text-muted-foreground">Attachments</p>
                <ul className="space-y-1.5">
                  {inv.attachments.map((a: any, i: number) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => downloadAttachment(a)}
                        className="inline-flex items-center gap-2 text-graphite hover:text-ember-orange text-left"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.filename}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {Array.isArray(inv.timeline) && inv.timeline.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <p className="mb-3 text-caption uppercase tracking-wider text-muted-foreground">Status history</p>
                <ol className="space-y-3">
                  {inv.timeline.map((t: any, i: number) => (
                    <li key={i} className="flex items-center gap-3">
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          i === inv.timeline.length - 1 ? 'bg-ember-orange' : 'bg-stone-surface',
                        )}
                      />
                      <span className="text-sm text-charcoal-primary">{statusLabel[t.status] || t.status}</span>
                      <span className="ml-auto text-caption text-muted-foreground">{formatDate(t.at)}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Detail({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-body text-charcoal-primary">{value}</p>
    </div>
  );
}
