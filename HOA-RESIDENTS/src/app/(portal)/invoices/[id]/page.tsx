'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, CreditCard, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

const statusBadgeMap: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'muted', sent: 'info', partial: 'warning', paid: 'success',
  voided: 'destructive', overdue: 'destructive', on_plan: 'secondary',
};

export default function ResidentInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const [invoice, setInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [intent, setIntent] = useState<any | null>(null);
  const [paying, setPaying] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<any>(`/invoices/${id}`).then((r) => setInvoice(r.data)),
      api.get<any>(`/payments/intents?invoiceId=${id}`).then((r) => {
        const intents = r.data || [];
        const live = intents.find((i: any) => i.status === 'pending' || i.status === 'success');
        setIntent(live || intents[0] || null);
      }).catch(() => setIntent(null)),
    ]).catch((err) => toast({ variant: 'error', title: 'Failed to load invoice', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // If the URL came back from a Paystack callback (?reference=...), verify it.
  useEffect(() => {
    const ref = params?.get('reference');
    if (!ref || !intent) return;
    // Match by reference
    if (intent.providerReference !== ref || intent.status === 'success') return;
    api.post(`/payments/intents/${intent.id}/verify`, {})
      .then(() => { toast({ variant: 'success', title: 'Payment confirmed' }); load(); })
      .catch(() => { /* noop — webhook may still land */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, intent]);

  const startCheckout = async () => {
    setPaying(true);
    try {
      const idemp = `pay-${id}-${Date.now()}`;
      const callbackUrl = `${window.location.origin}/invoices/${id}`;
      const r = await api.post<any>('/payments/intents', { invoiceId: id, callbackUrl }, idemp);
      const url = r.data.authorizationUrl;
      if (url) window.location.href = url;
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not start checkout', description: err.message });
    } finally {
      setPaying(false);
    }
  };

  if (loading || !invoice) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  const paidTotal = (invoice.payments || [])
    .filter((p: any) => p.status === 'completed')
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const outstanding = Math.max(0, Number(invoice.amount) - paidTotal);
  const canPay = !['paid', 'voided', 'on_plan'].includes(invoice.status) && outstanding > 0;

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-charcoal-primary">
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant={statusBadgeMap[invoice.status] || 'secondary'}>{invoice.status}</Badge>
          <span className="font-mono text-caption text-muted-foreground">{invoice.invoiceNumber}</span>
        </div>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
          {formatCurrency(Number(invoice.amount), invoice.currency)}
        </h1>
        <p className="text-caption text-muted-foreground">
          Due {formatDate(invoice.dueDate)} · Unit {invoice.unit?.unitNumber} · {invoice.unit?.estate?.name}
        </p>
      </header>

      {canPay && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-caption text-muted-foreground">Outstanding</p>
                <p className="font-display text-heading-md font-medium text-charcoal-primary">
                  {formatCurrency(outstanding, invoice.currency)}
                </p>
              </div>
              <Button onClick={startCheckout} disabled={paying}>
                <CreditCard className="mr-1.5 h-4 w-4" />{paying ? 'Starting…' : 'Pay now'}
              </Button>
            </div>
            {intent?.status === 'pending' && (
              <p className="text-caption text-deep-amber inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> A pending checkout already exists — clicking Pay now opens a fresh one.
              </p>
            )}
            {intent?.provider === 'mock' && (
              <p className="text-caption text-muted-foreground">
                Dev mode: Paystack isn&rsquo;t configured. The flow uses a local mock checkout.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {invoice.status === 'paid' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-meadow-green">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-medium">Paid in full</p>
            </div>
            {invoice.paidAt && <p className="text-caption text-muted-foreground mt-1">Settled {formatDate(invoice.paidAt)}.</p>}
          </CardContent>
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">Line items</h2>
        <Card>
          <CardContent className="p-0">
            {(invoice.lineItems?.length || 0) === 0 ? (
              <p className="p-6 text-caption text-muted-foreground">No line items.</p>
            ) : (
              <ul className="divide-y divide-stone-surface">
                {invoice.lineItems.map((li: any, i: number) => (
                  <li key={i} className="flex items-start justify-between p-4 gap-4">
                    <span className="text-sm text-graphite">{li.description}</span>
                    <span className="text-sm font-medium text-charcoal-primary tabular-nums">
                      {formatCurrency(Number(li.amount) * (li.quantity || 1), invoice.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {(invoice.payments?.length || 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">Payment history</h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-stone-surface">
                {invoice.payments.map((p: any) => (
                  <li key={p.id} className="flex items-start justify-between p-4 gap-4">
                    <div>
                      <p className="text-sm text-graphite">{p.method}</p>
                      <p className="text-caption text-muted-foreground">{formatDate(p.createdAt)} · ref {p.processorReference}</p>
                    </div>
                    <span className="text-sm font-medium text-charcoal-primary tabular-nums">
                      {formatCurrency(Number(p.amount), p.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
