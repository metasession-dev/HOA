'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Trash2, Play, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';

type Tier = { ageDays: number; kind: 'percent' | 'flat'; value: number; cap?: number };

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

export default function LateFeesPage() {
  const confirm = useConfirm();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [graceDays, setGraceDays] = useState(7);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [preview, setPreview] = useState<any>(null);

  const load = () => {
    setLoading(true);
    api.get<any>('/billing/late-fees/config').then((r) => {
      const c = r.data;
      setConfig(c);
      if (c) {
        setIsActive(c.isActive);
        setGraceDays(c.graceDays);
        setTiers((c.tiers as Tier[]) || []);
      }
    })
      .catch((err) => toast({ variant: 'error', title: 'Failed', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const addTier = () => {
    const lastDays = tiers.length > 0 ? tiers[tiers.length - 1].ageDays : 0;
    setTiers([...tiers, { ageDays: lastDays + 7, kind: 'percent', value: 5 }]);
  };

  const updateTier = (i: number, patch: Partial<Tier>) => {
    setTiers(tiers.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  };

  const removeTier = (i: number) => {
    setTiers(tiers.filter((_, idx) => idx !== i));
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/billing/late-fees/config', { isActive, graceDays, tiers });
      toast({ variant: 'success', title: 'Saved' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const runPreview = async () => {
    try {
      const r = await api.get<any>('/billing/late-fees/preview-sweep');
      setPreview(r.data);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Preview failed', description: err.message });
    }
  };

  const runSweep = async () => {
    const ok = await confirm({
      title: 'Run late-fee sweep now?',
      description: 'This will apply late fees to every overdue invoice per your tier config. Idempotent — already-charged tiers stay put.',
      confirmText: 'Run sweep',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const idemp = `sweep-${Date.now()}`;
      const r = await api.post<any>('/billing/late-fees/sweep', {}, idemp);
      toast({ variant: 'success', title: 'Sweep complete', description: `${r.data.applied} applied · ${r.data.skipped} skipped · ${r.data.totalDelta} ${r.data.currency} added` });
      load();
      setPreview(null);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Late fees</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Tiered surcharges applied to overdue invoices. Sweeps are idempotent — a re-run on the same tier is a no-op.
        </p>
      </header>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Status</h3>
              <p className="text-caption text-muted-foreground">{isActive ? 'Active — sweeps will charge fees.' : 'Paused — sweeps refuse.'}</p>
            </div>
            <Button variant={isActive ? 'destructive' : 'default'} onClick={() => setIsActive(!isActive)}>
              {isActive ? 'Pause' : 'Activate'}
            </Button>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="g">Grace days after due</Label>
            <Input id="g" type="number" min="0" max="365" value={graceDays} onChange={(e) => setGraceDays(Number(e.target.value))} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Tiers</h3>
              <Button size="sm" variant="secondary" onClick={addTier}><Plus className="mr-1 h-3.5 w-3.5" />Add tier</Button>
            </div>
            <p className="text-caption text-muted-foreground mb-2">Sorted by ageDays asc. Highest tier whose threshold the invoice has crossed wins.</p>
            {tiers.length === 0 ? (
              <p className="text-caption text-muted-foreground italic">No tiers yet — add one to start enforcing.</p>
            ) : (
              <ul className="space-y-2">
                {tiers.map((t, i) => (
                  <li key={i} className="rounded-lg shadow-inset-stone p-3">
                    <div className="grid grid-cols-4 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-[11px]">After (days)</Label>
                        <Input type="number" min="0" value={t.ageDays} onChange={(e) => updateTier(i, { ageDays: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Kind</Label>
                        <select className={selectClass} value={t.kind} onChange={(e) => updateTier(i, { kind: e.target.value as any })}>
                          <option value="percent">Percent</option>
                          <option value="flat">Flat</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">{t.kind === 'percent' ? 'Value (%)' : 'Value'}</Label>
                        <Input type="number" min="0" step="0.01" value={t.value} onChange={(e) => updateTier(i, { value: Number(e.target.value) })} />
                      </div>
                      <div className="flex gap-1">
                        <div className="space-y-1 flex-1">
                          <Label className="text-[11px]">Cap (optional)</Label>
                          <Input type="number" min="0" step="0.01" value={t.cap ?? ''} onChange={(e) => updateTier(i, { cap: e.target.value ? Number(e.target.value) : undefined })} />
                        </div>
                        <Button size="icon" variant="ghost" className="shrink-0 h-9 w-9 mt-5" onClick={() => removeTier(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-between items-center pt-2">
            {config?.lastSweepAt && <p className="text-caption text-muted-foreground">Last sweep {formatDate(config.lastSweepAt)}</p>}
            <Button onClick={save} disabled={busy}>Save config</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Run sweep</h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={runPreview}
                disabled={!isActive || tiers.length === 0}
              >
                <Eye className="mr-1 h-3.5 w-3.5" />Preview
              </Button>
              <Button
                size="sm"
                onClick={runSweep}
                disabled={busy || !isActive || tiers.length === 0}
              >
                <Play className="mr-1 h-3.5 w-3.5" />Run now
              </Button>
            </div>
          </div>

          {/* Guard rail so admins on a fresh org see why the buttons are disabled
              instead of clicking through and hitting a 400. */}
          {(!isActive || tiers.length === 0) && !preview && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-caption text-deep-amber">
              {tiers.length === 0
                ? 'Add at least one tier above and save before running a sweep.'
                : 'Policy is paused. Activate it above before running a sweep.'}
            </p>
          )}

          {preview && preview.configured === false && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-caption text-deep-amber">
              {preview.reason === 'no_tiers'
                ? 'Policy saved but has no tiers — add tiers and try again.'
                : 'Policy is not active for this organization.'}
            </p>
          )}

          {preview && preview.configured !== false && (
            <div className="rounded-lg bg-stone-surface/60 p-3 space-y-1">
              <p className="text-caption text-graphite">
                <strong className="text-charcoal-primary">{preview.eligibleCount}</strong> invoice(s) eligible · would add{' '}
                <strong className="text-charcoal-primary">{preview.totalDelta} {preview.currency}</strong> in late fees.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
