'use client';

import { useEffect, useState } from 'react';
import { Banknote, Plus, RefreshCw, ArrowRight, Globe2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, getOrgCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  AFRICAN_CURRENCIES,
  REFERENCE_CURRENCIES,
  CURRENCY_BY_CODE,
  currencyLabel,
  flagFor,
} from '@/lib/african-currencies';

type Rate = {
  id: string;
  organizationId: string | null;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  asOfDate: string;
  source: string;
  notes?: string;
  enteredBy?: string | null;
};

// Shared classNames for the select inputs so they match the rest of the form.
const SELECT_CLS =
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40';

/**
 * Render a <select> populated with every African ISO-4217 currency, with
 * major reference currencies in a second optgroup. Flag emoji + name make
 * "ZWG" recognisable without operator memorising 40+ codes.
 */
function CurrencySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select id={id} className={SELECT_CLS} value={value} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="African currencies">
        {AFRICAN_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {currencyLabel(c)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Reference">
        {REFERENCE_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {currencyLabel(c)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export default function FxPage() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Add-rate form
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState(getOrgCurrency());
  const [rate, setRate] = useState('');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // Convert preview
  const [convAmount, setConvAmount] = useState('1000');
  const [convFrom, setConvFrom] = useState('USD');
  const [convTo, setConvTo] = useState(getOrgCurrency());
  const [convResult, setConvResult] = useState<any>(null);

  const load = () => {
    setLoading(true);
    api.get<any>('/fx/rates')
      .then((r) => setRates(r.data || []))
      .catch((err) => toast({ variant: 'error', title: 'Failed to load rates', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const addRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = parseFloat(rate);
    if (!Number.isFinite(r) || r <= 0) {
      toast({ variant: 'error', title: 'Rate must be a positive number' });
      return;
    }
    setBusy(true);
    try {
      const idemp = `fx-${from}-${to}-${asOfDate}-${Date.now()}`;
      await api.post('/fx/rates', {
        fromCurrency: from.toUpperCase(),
        toCurrency: to.toUpperCase(),
        rate: r,
        asOfDate,
        notes: notes || undefined,
      }, idemp);
      toast({ variant: 'success', title: 'Rate saved' });
      setRate(''); setNotes('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const runSync = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>('/fx/sync', {});
      if (r.data?.ok) {
        toast({ variant: 'success', title: 'Daily sync complete', description: `${r.data.inserted} rates updated` });
      } else {
        toast({ variant: 'info', title: 'Sync skipped', description: r.data?.reason || 'OXR not configured' });
      }
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Sync failed', description: err.message });
    } finally { setBusy(false); }
  };

  const runConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setConvResult(null);
    try {
      const r = await api.get<any>(`/fx/convert?amount=${convAmount}&from=${convFrom.toUpperCase()}&to=${convTo.toUpperCase()}`);
      setConvResult(r.data);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Conversion failed', description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Exchange rates</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Per-org rates win over the global daily set. Rates are locked into invoices at issue time.
          </p>
        </div>
        <Button variant="secondary" onClick={runSync} disabled={busy}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', busy && 'animate-spin')} />Sync daily rates
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Manual rate entry
            </h3>
            <form onSubmit={addRate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="from">From</Label>
                  <CurrencySelect id="from" value={from} onChange={setFrom} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="to">To</Label>
                  <CurrencySelect id="to" value={to} onChange={setTo} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rate">Rate</Label>
                  <Input id="rate" type="number" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="asOf">As-of date</Label>
                  <Input id="asOf" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mid-rate from FNB, etc." />
              </div>
              <Button type="submit" disabled={busy} className="w-full">Save rate</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary inline-flex items-center gap-2">
              <ArrowRight className="h-4 w-4" /> Quick convert
            </h3>
            <form onSubmit={runConvert} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ca">Amount</Label>
                  <Input id="ca" type="number" step="0.01" value={convAmount} onChange={(e) => setConvAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cf">From</Label>
                  <CurrencySelect id="cf" value={convFrom} onChange={setConvFrom} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ct">To</Label>
                  <CurrencySelect id="ct" value={convTo} onChange={setConvTo} />
                </div>
              </div>
              <Button type="submit" variant="secondary" className="w-full">Convert</Button>
            </form>
            {convResult && (
              <div className="rounded-lg bg-stone-surface/60 px-4 py-3">
                <p className="text-caption text-muted-foreground">{convAmount} {convResult.from} →</p>
                <p className="font-display text-heading-sm tabular-nums text-charcoal-primary">
                  {Number(convResult.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} {convResult.to}
                </p>
                <p className="text-caption text-muted-foreground mt-1">
                  Rate {Number(convResult.rate).toFixed(6)} · as of {convResult.asOfDate}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : rates.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-meadow-green/15 text-meadow-green">
              <Banknote className="h-5 w-5" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No rates yet</p>
            <p className="text-caption text-muted-foreground">Run Sync or enter your first manual rate.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-stone-surface/60 text-caption text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Pair</th>
                <th className="px-4 py-2 text-right font-medium">Rate</th>
                <th className="px-4 py-2 text-left font-medium">As of</th>
                <th className="px-4 py-2 text-left font-medium">Source</th>
                <th className="px-4 py-2 text-left font-medium">Scope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-surface">
              {rates.map((r) => {
                const fromMeta = CURRENCY_BY_CODE[r.fromCurrency];
                const toMeta = CURRENCY_BY_CODE[r.toCurrency];
                return (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-mono text-graphite">
                    <span className="inline-flex items-center gap-1">
                      {fromMeta && (
                        <span title={fromMeta.name} aria-hidden>{flagFor(fromMeta.country)}</span>
                      )}
                      <span>{r.fromCurrency}</span>
                      <span className="text-muted-foreground">→</span>
                      {toMeta && (
                        <span title={toMeta.name} aria-hidden>{flagFor(toMeta.country)}</span>
                      )}
                      <span>{r.toCurrency}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-charcoal-primary">{Number(r.rate).toFixed(6)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(r.asOfDate)}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={r.source === 'manual' ? 'info' : 'muted'}>{r.source}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.organizationId ? (
                      <span className="text-caption text-graphite">Your org</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
                        <Globe2 className="h-3 w-3" /> Global
                      </span>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </CardContent></Card>
    </div>
  );
}
