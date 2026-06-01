'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Send, Ban, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardWarm } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';

const statusBadgeMap: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'muted',
  sent: 'info',
  partial: 'warning',
  paid: 'success',
  voided: 'destructive',
  overdue: 'destructive',
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchInvoice = () => {
    api
      .get<any>(`/invoices/${id}`)
      .then((res) => setInvoice(res.data))
      .catch((err) => {
        toast({ variant: 'error', title: 'Could not load invoice', description: err.message });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const handleSend = async () => {
    const ok = await confirm({
      title: `Send invoice ${invoice?.invoiceNumber}?`,
      description: 'The resident will receive the invoice via their configured channels.',
      confirmText: 'Send invoice',
    });
    if (!ok) return;
    try {
      await api.post(`/invoices/${id}/send`);
      toast({ variant: 'success', title: 'Invoice sent' });
      fetchInvoice();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Send failed', description: err.message });
    }
  };

  const handleVoid = async () => {
    const ok = await confirm({
      title: `Void invoice ${invoice?.invoiceNumber}?`,
      description: 'Voiding cannot be undone. The resident will see this as cancelled.',
      confirmText: 'Void invoice',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.post(`/invoices/${id}/void`);
      toast({ variant: 'success', title: 'Invoice voided' });
      fetchInvoice();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Void failed', description: err.message });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-body text-muted-foreground">Invoice not found.</p>
        </CardContent>
      </Card>
    );
  }

  const lineItems = (invoice.lineItems as any[]) || [];
  // Server-authoritative paid amount (the maintained ledger cache), not a
  // client-side sum of payment rows (which would double-count reversed ones).
  const totalPaid = Number(invoice.amountPaid ?? 0);
  const outstanding = Math.max(Number(invoice.amount) - totalPaid, 0);

  return (
    <div className="space-y-6">
      <Link
        href="/finance/invoices"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        Invoices
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-caption text-muted-foreground">{invoice.invoiceNumber}</p>
          <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">
            {formatCurrency(Number(invoice.amount))}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-body text-muted-foreground">
            <Badge variant={statusBadgeMap[invoice.status] || 'secondary'}>{invoice.status}</Badge>
            <span>·</span>
            <span>Due {formatDate(invoice.dueDate)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {invoice.status === 'draft' && (
            <Button onClick={handleSend}>
              <Send className="mr-1.5 h-4 w-4" />
              Send
            </Button>
          )}
          {invoice.status !== 'paid' && invoice.status !== 'voided' && (
            <Button variant="secondary" onClick={handleVoid}>
              <Ban className="mr-1.5 h-4 w-4" />
              Void
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardContent className="p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-caption uppercase tracking-wider text-muted-foreground">Unit</p>
              <p className="mt-1 text-body font-medium text-charcoal-primary">
                Unit {invoice.unit?.unitNumber}
              </p>
              <p className="text-caption text-muted-foreground">{invoice.unit?.estate?.name}</p>
            </div>
            <div>
              <p className="text-caption uppercase tracking-wider text-muted-foreground">Issued</p>
              <p className="mt-1 text-body font-medium text-charcoal-primary">
                {formatDate(invoice.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-caption uppercase tracking-wider text-muted-foreground">Type</p>
              <p className="mt-1 text-body font-medium text-charcoal-primary capitalize">
                {invoice.type?.replace('_', ' ')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-stone-surface px-6 py-4">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Line items</h3>
            <Badge variant="muted">{lineItems.length}</Badge>
          </div>
          {lineItems.length === 0 ? (
            <div className="p-10 text-center text-caption text-muted-foreground">
              No line items on this invoice.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3 text-right">Qty</th>
                  <th className="px-6 py-3 text-right">Unit price</th>
                  <th className="px-6 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item: any, idx: number) => {
                  const qty = Number(item.quantity) || 1;
                  const unit = Number(item.unitPrice) || 0;
                  return (
                    <tr
                      key={idx}
                      className={idx !== lineItems.length - 1 ? 'border-b border-stone-surface' : ''}
                    >
                      <td className="px-6 py-3 text-graphite">{item.description}</td>
                      <td className="px-6 py-3 text-right text-graphite">{qty}</td>
                      <td className="px-6 py-3 text-right text-graphite">
                        {formatCurrency(unit)}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-charcoal-primary">
                        {formatCurrency(unit * qty)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-stone-surface bg-stone-surface/40">
                  <td colSpan={3} className="px-6 py-3 text-right text-caption text-muted-foreground">
                    Total
                  </td>
                  <td className="px-6 py-3 text-right font-display text-heading-sm font-medium text-charcoal-primary">
                    {formatCurrency(Number(invoice.amount))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Payments</h3>
            {outstanding > 0 && invoice.status !== 'voided' && (
              <Button variant="secondary" size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Log payment
              </Button>
            )}
          </div>

          <CardWarm className="mt-4 p-5">
            <div className="grid grid-cols-3 gap-4 text-center sm:text-left">
              <div>
                <p className="text-caption uppercase tracking-wider text-muted-foreground">Invoiced</p>
                <p className="mt-1 font-display text-heading-sm font-medium text-charcoal-primary">
                  {formatCurrency(Number(invoice.amount))}
                </p>
              </div>
              <div>
                <p className="text-caption uppercase tracking-wider text-muted-foreground">Paid</p>
                <p className="mt-1 font-display text-heading-sm font-medium text-meadow-green">
                  {formatCurrency(totalPaid)}
                </p>
              </div>
              <div>
                <p className="text-caption uppercase tracking-wider text-muted-foreground">Outstanding</p>
                <p
                  className={`mt-1 font-display text-heading-sm font-medium ${outstanding > 0 ? 'text-coral-red' : 'text-graphite'}`}
                >
                  {formatCurrency(outstanding)}
                </p>
              </div>
            </div>
          </CardWarm>

          {(invoice.payments || []).length > 0 && (
            <div className="mt-4 divide-y divide-stone-surface">
              {invoice.payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-charcoal-primary">
                      {formatCurrency(Number(p.amount))}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {p.method} · {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <Badge variant="success">{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
