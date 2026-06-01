'use client';

/**
 * Pay ahead (Phase 5 — resident prepay / choose-your-term).
 *
 * Pick a recurring charge attached to your unit, choose how far ahead to pay
 * (N periods for monthly/quarterly/… charges, or N days for daily/weekly ones),
 * preview the quote, and check out. The server materializes the period invoices
 * and settles them all in one payment.
 */
import { useEffect, useMemo, useState } from 'react';
import { Wallet, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

type Charge = {
  id: string;
  amount: string;
  baseTerm: string;
  currency: string;
  mode: 'period' | 'day';
  billingType: { id: string; name: string; baseTerm: string };
  unit: { id: string; unitNumber: string };
};

const TERM_UNIT: Record<string, string> = {
  daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', biannual: 'half-year', annual: 'year',
};
const PERIOD_PRESETS = [1, 3, 6, 12];
const DAY_PRESETS = [7, 30, 90, 180];

export default function PrepayPage() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [quote, setQuote] = useState<any | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api.get<any>('/payments/prepay/charges')
      .then((r) => {
        const list = r.data || [];
        setCharges(list);
        if (list[0]) setSelectedId(list[0].id);
      })
      .catch((err) => toast({ variant: 'error', title: 'Could not load charges', description: err.message }))
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(() => charges.find((c) => c.id === selectedId) || null, [charges, selectedId]);
  const isDay = selected?.mode === 'day';
  const presets = isDay ? DAY_PRESETS : PERIOD_PRESETS;
  const unitLabel = selected ? (isDay ? 'day' : TERM_UNIT[selected.baseTerm] || 'period') : 'period';

  // Reset the count to a sensible default when switching charges.
  useEffect(() => { setCount(isDay ? 30 : 1); setQuote(null); }, [selectedId, isDay]);

  const loadQuote = async () => {
    if (!selected || count < 1) return;
    setQuoting(true);
    try {
      const q = isDay ? `days=${count}` : `periods=${count}`;
      const r = await api.get<any>(`/payments/prepay/charges/${selected.id}/quote?${q}`);
      setQuote(r.data);
    } catch (err: any) {
      setQuote(null);
      toast({ variant: 'error', title: 'Could not quote', description: err.message });
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(loadQuote, 250); // debounce while typing
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, count, isDay]);

  const pay = async () => {
    if (!selected || !quote || quote.count === 0) return;
    setPaying(true);
    try {
      const callbackUrl = `${window.location.origin}/invoices`;
      const body: any = { unitBillingId: selected.id, callbackUrl };
      if (isDay) body.days = count; else body.periods = count;
      const r = await api.post<any>('/payments/prepay', body);
      const url = r.data?.authorizationUrl;
      if (url) { window.location.href = url; return; }
      toast({ variant: 'error', title: 'Could not start checkout' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Payment failed', description: err.message });
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-72" /></div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="inline-flex items-center gap-2 font-display text-heading-lg leading-tight text-charcoal-primary">
          <Wallet className="h-6 w-6 text-muted-foreground" />Pay ahead
        </h1>
        <p className="mt-1 text-body text-muted-foreground">
          Settle your recurring charges in advance — choose how far ahead and pay in one go.
        </p>
      </header>

      {charges.length === 0 ? (
        <Card><CardContent className="p-10 text-center">
          <p className="text-body font-medium text-charcoal-primary">Nothing to prepay yet</p>
          <p className="text-caption text-muted-foreground">When your community sets up recurring charges on your unit, they&rsquo;ll appear here.</p>
        </CardContent></Card>
      ) : (
        <>
          <Card><CardContent className="p-0">
            <ul className="divide-y divide-stone-surface">
              {charges.map((c) => {
                const active = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn('flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors', active ? 'bg-stone-surface/60' : 'hover:bg-stone-surface/40')}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-charcoal-primary">{c.billingType?.name}</p>
                        <p className="text-caption text-muted-foreground">
                          {formatCurrency(Number(c.amount), c.currency)} / {TERM_UNIT[c.baseTerm] || c.baseTerm} · Unit {c.unit?.unitNumber}
                        </p>
                      </div>
                      {active && <Badge variant="success">selected</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent></Card>

          {selected && (
            <Card><CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <Label>How far ahead?</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCount(p)}
                      className={cn('rounded-lg border px-3 py-1.5 text-sm', count === p ? 'border-charcoal-primary bg-charcoal-primary text-white' : 'border-stone-surface text-graphite hover:bg-stone-surface/50')}
                    >
                      {p} {unitLabel}{p > 1 ? 's' : ''}
                    </button>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={isDay ? 366 : 60}
                      value={count}
                      onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-24"
                    />
                    <span className="text-caption text-muted-foreground">{unitLabel}(s)</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-stone-surface bg-stone-surface/30 p-4">
                {quoting ? (
                  <Skeleton className="h-16" />
                ) : !quote ? (
                  <p className="text-caption text-muted-foreground">Choose a term to see the total.</p>
                ) : quote.count === 0 ? (
                  <p className="text-caption text-muted-foreground">You&rsquo;re already covered for this period — nothing to prepay.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-caption uppercase tracking-wider text-muted-foreground">Total for {quote.termLabel}</p>
                        <p className="font-display text-heading-lg font-medium tabular-nums text-charcoal-primary">
                          {formatCurrency(Number(quote.totalAmount), quote.currency)}
                        </p>
                      </div>
                      <Badge variant="info">{quote.count} invoice{quote.count > 1 ? 's' : ''}</Badge>
                    </div>
                    {quote.periods?.length > 0 && (
                      <p className="text-caption text-muted-foreground">
                        Covers {formatDate(quote.periods[0].from)} → {formatDate(quote.periods[quote.periods.length - 1].to)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={pay} disabled={paying || !quote || quote.count === 0}>
                  {paying ? 'Starting checkout…' : <>Pay {quote && quote.count > 0 ? formatCurrency(Number(quote.totalAmount), quote.currency) : ''}<ArrowRight className="ml-1.5 h-4 w-4" /></>}
                </Button>
              </div>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}
