'use client';

/**
 * Generate charges (Phase 3 of unit-default-billing).
 *
 * Issues one invoice per active unit for a billing type for the current period.
 * Always previews first (a dry-run: how many units will be billed / are already
 * billed). Re-running the same period is a safe no-op — generation is idempotent
 * via the per-unit period unique. Daily/weekly charges are billed via resident
 * prepay, not here, so they're excluded.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Play } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

const SCHEDULABLE = ['monthly', 'quarterly', 'biannual', 'annual'];
const TERM_LABEL: Record<string, string> = {
  monthly: 'Monthly', quarterly: 'Quarterly', biannual: 'Bi-annual', annual: 'Annual',
};

export default function BillingRunsPage() {
  const confirm = useConfirm();
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingTypeId, setBillingTypeId] = useState('');
  const [preview, setPreview] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<any>('/billing/catalog')
      .then((r) => {
        const schedulable = (r.data || []).filter((t: any) => t.isActive && SCHEDULABLE.includes(t.baseTerm));
        setTypes(schedulable);
        if (schedulable[0]) setBillingTypeId(schedulable[0].id);
      })
      .catch((err) => toast({ variant: 'error', title: 'Could not load', description: err.message }))
      .finally(() => setLoading(false));
  }, []);

  const loadPreview = async (id: string) => {
    if (!id) { setPreview(null); return; }
    setPreviewing(true);
    try {
      const r = await api.post<any>(`/billing/catalog/${id}/generate-preview`, {});
      setPreview(r.data);
    } catch (err: any) {
      setPreview(null);
      toast({ variant: 'error', title: 'Preview failed', description: err.message });
    } finally {
      setPreviewing(false);
    }
  };

  useEffect(() => { loadPreview(billingTypeId); /* eslint-disable-next-line */ }, [billingTypeId]);

  const selectedType = useMemo(() => types.find((t) => t.id === billingTypeId), [types, billingTypeId]);

  const generate = async () => {
    if (!preview || preview.toBill === 0) return;
    const ok = await confirm({
      title: `Generate ${preview.toBill} invoice(s)?`,
      description: `Bills ${selectedType?.name} to ${preview.toBill} unit(s) for ${preview.periodKey}. Already-billed units are skipped.`,
      confirmText: 'Generate',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post<any>(`/billing/catalog/${billingTypeId}/generate`, {});
      toast({ variant: 'success', title: 'Charges generated', description: `${r.data.created} invoice(s) created · ${r.data.skipped} skipped` });
      loadPreview(billingTypeId);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const generateAll = async () => {
    const ok = await confirm({
      title: 'Generate all due charges?',
      description: 'Issues the current period for every active monthly/quarterly/bi-annual/annual charge across the organisation. Idempotent — already-billed units are skipped.',
      confirmText: 'Generate all',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post<any>('/billing/generate-charges-due', {});
      toast({ variant: 'success', title: 'Done', description: `${r.data.totalCreated} invoice(s) created across ${r.data.types?.length || 0} charge type(s)` });
      loadPreview(billingTypeId);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-80" /></div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 font-display text-heading-lg leading-tight text-charcoal-primary">
            <CalendarDays className="h-6 w-6 text-muted-foreground" />Generate charges
          </h1>
          <p className="mt-1 text-body text-muted-foreground">
            Issue this period&rsquo;s invoices for a billing charge across every unit that carries it.
          </p>
        </div>
        {types.length > 0 && (
          <Button variant="secondary" onClick={generateAll} disabled={busy}>Generate all due</Button>
        )}
      </header>

      {types.length === 0 ? (
        <Card><CardContent className="p-10 text-center">
          <p className="text-body font-medium text-charcoal-primary">No schedulable charges</p>
          <p className="text-caption text-muted-foreground">
            Create monthly/quarterly/annual charges in Settings → Billing catalog and activate them on units first.
          </p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="space-y-5 p-6">
          <div className="space-y-1.5 sm:max-w-sm">
            <Label htmlFor="bt">Billing charge</Label>
            <select id="bt" className={selectClass} value={billingTypeId} onChange={(e) => setBillingTypeId(e.target.value)}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name} · {TERM_LABEL[t.baseTerm] || t.baseTerm}</option>)}
            </select>
          </div>

          <div className="rounded-lg border border-stone-surface bg-stone-surface/30 p-4">
            {previewing ? (
              <Skeleton className="h-16" />
            ) : !preview ? (
              <p className="text-caption text-muted-foreground">Select a charge to preview.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="info">{preview.periodKey}</Badge>
                  <span className="text-caption text-muted-foreground">period to bill</span>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Active units" value={preview.totalActive} />
                  <Stat label="Already billed" value={preview.alreadyBilled} />
                  <Stat label="To bill" value={preview.toBill} accent />
                  <Stat label="Total" value={formatCurrency(Number(preview.totalAmount), preview.currency)} />
                </div>
                {preview.alreadyBilled > 0 && (
                  <p className="text-caption text-muted-foreground">
                    {preview.alreadyBilled} unit(s) already have an invoice for this charge &amp; period (issued or paid, incl. prepaid) and are skipped — no double billing.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-stone-surface pt-4">
            <Button onClick={generate} disabled={busy || !preview || preview.toBill === 0}>
              <Play className="mr-1.5 h-4 w-4" />
              {preview && preview.toBill > 0 ? `Generate ${preview.toBill} invoice(s)` : 'Nothing to bill'}
            </Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div>
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-heading-sm font-medium tabular-nums', accent ? 'text-ember-orange' : 'text-charcoal-primary')}>{value}</p>
    </div>
  );
}
