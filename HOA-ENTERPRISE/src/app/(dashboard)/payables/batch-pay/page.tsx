'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Banknote, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';

export default function BatchPayPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prefix, setPrefix] = useState(`BATCH-${new Date().toISOString().slice(0, 10)}`);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<any>('/vendor-invoices?status=approved').then((r) => setItems(r.data || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const total = useMemo(() => items.filter((i) => selected.has(i.id)).reduce((s, i) => s + Number(i.amount), 0), [items, selected]);

  const run = async () => {
    if (selected.size === 0) return toast({ variant: 'error', title: 'Select at least one invoice' });
    if (!prefix.trim()) return toast({ variant: 'error', title: 'Reference prefix required' });
    const ok = await confirm({
      title: `Pay ${selected.size} invoice(s)?`,
      description: `Total: R ${total.toFixed(2)}. References will be ${prefix}-001, ${prefix}-002, …`,
      confirmText: 'Run batch',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const idemp = `batch-${prefix}-${Date.now()}`;
      const r = await api.post<any>('/vendor-invoices/batch-pay', { invoiceIds: Array.from(selected), paymentReferencePrefix: prefix.trim() }, idemp);
      toast({ variant: 'success', title: `Batch complete`, description: `${r.data.succeeded} of ${r.data.totalProcessed} paid` });
      router.push('/payables?status=paid');
    } catch (err: any) {
      toast({ variant: 'error', title: 'Batch failed', description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/payables" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Payables
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Batch pay</h1>
        <p className="mt-1 text-body text-muted-foreground">Select approved invoices to mark as paid in one operation.</p>
      </header>

      <Card><CardContent className="space-y-4 p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Reference prefix <span className="text-coral-red">*</span></Label>
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} required />
            <p className="text-caption text-muted-foreground">Each paid invoice will get a sequenced reference, e.g. {prefix || 'BATCH'}-001.</p>
          </div>
          <div className="flex flex-col items-end justify-end">
            <p className="text-caption text-muted-foreground">{selected.size} selected</p>
            <p className="text-heading-sm font-display tabular-nums text-charcoal-primary">R {total.toFixed(2)}</p>
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center"><p className="text-body text-muted-foreground">No approved invoices waiting for payment.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 w-10"><button onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.id)))} className="text-muted-foreground hover:text-graphite">{selected.size === items.length ? '☑' : '☐'}</button></th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => {
                  const sel = selected.has(inv.id);
                  return (
                    <tr key={inv.id}
                      onClick={() => toggle(inv.id)}
                      className={cn('cursor-pointer border-b border-stone-surface last:border-b-0 transition-colors', sel ? 'bg-ember-orange/5' : 'hover:bg-stone-surface/50')}>
                      <td className="px-4 py-3">
                        <div className={cn('h-5 w-5 rounded border flex items-center justify-center transition-colors', sel ? 'bg-midnight border-midnight text-white' : 'border-graphite/30')}>
                          {sel && <Check className="h-3 w-3" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-graphite font-medium">{inv.vendor?.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{inv.vendorInvoiceNo}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                      <td className="px-4 py-3 text-graphite tabular-nums text-right">{inv.currency} {Number(inv.amount).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button disabled={busy || selected.size === 0} onClick={run}><Banknote className="mr-1.5 h-3.5 w-3.5" />{busy ? 'Processing…' : `Pay ${selected.size} invoice${selected.size !== 1 ? 's' : ''}`}</Button>
      </div>
    </div>
  );
}
