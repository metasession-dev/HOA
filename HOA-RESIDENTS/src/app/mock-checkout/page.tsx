'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { getOrgCurrency } from '@/lib/utils';

/**
 * Dev-only mock of a Paystack hosted-checkout page. Used when
 * PAYSTACK_SECRET_KEY isn't set on the API. Hitting "Pay" calls a server
 * endpoint that fans out the synthetic webhook event so the full payment
 * flow (invoice paid, audit log, webhook fanout) gets exercised end-to-end.
 *
 * Next 14 requires any component that reads useSearchParams() to live inside
 * a Suspense boundary so the page can statically prerender (the searchParams
 * resolve client-side). The inner component holds the reading + UI.
 */
function MockCheckoutInner() {
  const params = useSearchParams();
  const reference = params?.get('reference') || '';
  const amount = params?.get('amount') || '0';
  const currency = params?.get('currency') || getOrgCurrency();
  const callback = params?.get('callback') || '/invoices';
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    setBusy(true);
    try {
      await api.post('/payments/intents/mock-complete', { reference });
      window.location.href = callback;
    } catch (err: any) {
      toast({ variant: 'error', title: 'Mock pay failed', description: err.message });
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-6 mt-12 space-y-4">
      <header>
        <Badge variant="muted">Mock checkout (dev)</Badge>
        <h1 className="mt-2 font-display text-heading-lg text-charcoal-primary">Confirm payment</h1>
        <p className="mt-1 text-caption text-muted-foreground">
          This page simulates Paystack&rsquo;s hosted checkout for local dev. In production with PAYSTACK_SECRET_KEY set, the
          resident lands on Paystack&rsquo;s real checkout instead.
        </p>
      </header>

      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-caption text-muted-foreground">Amount</span>
            <span className="font-display text-heading-md text-charcoal-primary">{Number(amount) / 100} {currency}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-caption text-muted-foreground">Reference</span>
            <span className="font-mono text-caption text-graphite">{reference}</span>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => (window.location.href = callback)}>
              <X className="mr-1 h-3.5 w-3.5" />Cancel
            </Button>
            <Button onClick={pay} disabled={busy}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />{busy ? 'Paying…' : 'Pay'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md p-6 mt-12 text-muted-foreground">Loading…</div>}>
      <MockCheckoutInner />
    </Suspense>
  );
}
