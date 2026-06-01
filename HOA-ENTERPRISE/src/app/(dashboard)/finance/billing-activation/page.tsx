'use client';

/**
 * Billing activation (Phase 2 of unit-default-billing).
 *
 * Activate or deactivate a catalog billing type across one or many units —
 * either every unit in an estate, or a hand-picked set. Always preview first
 * (a dry-run that reports how many units would change) before applying.
 */
import { useEffect, useMemo, useState } from 'react';
import { Banknote, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter,
} from '@/components/ui/drawer';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

export default function BillingActivationPage() {
  const [billingTypes, setBillingTypes] = useState<any[]>([]);
  const [estates, setEstates] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [billingTypeId, setBillingTypeId] = useState('');
  const [estateId, setEstateId] = useState('');
  const [scope, setScope] = useState<'estate' | 'units'>('estate');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<'activate' | 'deactivate'>('activate');
  const [attachIfMissing, setAttachIfMissing] = useState(true);

  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<any>('/billing/catalog').then((r) => (r.data || []).filter((t: any) => t.isActive)),
      api.get<any>('/estates').then((r) => r.data || []),
    ])
      .then(([types, est]) => {
        setBillingTypes(types);
        setEstates(est);
        if (types[0]) setBillingTypeId(types[0].id);
        if (est[0]) setEstateId(est[0].id);
      })
      .catch((err) => toast({ variant: 'error', title: 'Could not load', description: err.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!estateId) { setUnits([]); return; }
    api.get<any>(`/estates/${estateId}/units`).then((r) => setUnits(r.data || [])).catch(() => setUnits([]));
    setSelected(new Set());
  }, [estateId]);

  const allSelected = units.length > 0 && selected.size === units.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(units.map((u) => u.id)));
  const toggleUnit = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const target = useMemo(
    () => (scope === 'units' ? { unitIds: Array.from(selected) } : { estateIds: [estateId] }),
    [scope, selected, estateId],
  );

  const canRun = !!billingTypeId && (scope === 'estate' ? !!estateId : selected.size > 0);

  const runPreview = async () => {
    if (!canRun) return;
    setBusy(true);
    try {
      const r = await api.post<any>(`/billing/catalog/${billingTypeId}/activation-preview`, target);
      setPreview(r.data);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Preview failed', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>(`/billing/catalog/${billingTypeId}/bulk-activate`, {
        target,
        active: action === 'activate',
        attachIfMissing: action === 'activate' ? attachIfMissing : false,
      });
      const d = r.data || {};
      toast({
        variant: 'success',
        title: action === 'activate' ? 'Activated' : 'Deactivated',
        description: `${d.changed} unit(s) changed · ${d.created} newly attached · ${d.skipped} unchanged`,
      });
      setPreview(null);
      if (scope === 'units') setSelected(new Set());
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  }

  const selectedType = billingTypes.find((t) => t.id === billingTypeId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="inline-flex items-center gap-2 font-display text-heading-lg leading-tight text-charcoal-primary">
          <Banknote className="h-6 w-6 text-muted-foreground" />Billing activation
        </h1>
        <p className="mt-1 text-body text-muted-foreground">
          Turn a billing charge on or off across many units at once. Preview before you apply.
        </p>
      </header>

      {billingTypes.length === 0 ? (
        <Card><CardContent className="p-10 text-center">
          <p className="text-body font-medium text-charcoal-primary">No billing types yet</p>
          <p className="text-caption text-muted-foreground">Create charges in Settings → Billing catalog first.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="space-y-5 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bt">Billing charge</Label>
              <select id="bt" className={selectClass} value={billingTypeId} onChange={(e) => setBillingTypeId(e.target.value)}>
                {billingTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es">Estate</Label>
              <select id="es" className={selectClass} value={estateId} onChange={(e) => setEstateId(e.target.value)}>
                {estates.map((es) => <option key={es.id} value={es.id}>{es.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Apply to</Label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setScope('estate')}
                className={cn('rounded-lg border px-3 py-1.5 text-sm', scope === 'estate' ? 'border-charcoal-primary bg-charcoal-primary text-white' : 'border-stone-surface text-graphite hover:bg-stone-surface/50')}>
                All units in estate
              </button>
              <button type="button" onClick={() => setScope('units')}
                className={cn('rounded-lg border px-3 py-1.5 text-sm', scope === 'units' ? 'border-charcoal-primary bg-charcoal-primary text-white' : 'border-stone-surface text-graphite hover:bg-stone-surface/50')}>
                Pick units{scope === 'units' && selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
            </div>
          </div>

          {scope === 'units' && (
            <div className="rounded-lg border border-stone-surface">
              <div className="flex items-center justify-between border-b border-stone-surface px-3 py-2">
                <span className="text-caption text-muted-foreground">{units.length} unit(s)</span>
                <button type="button" onClick={toggleAll} className="text-caption font-medium text-ember-orange hover:underline">
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {units.length === 0 ? (
                  <p className="p-4 text-caption text-muted-foreground">No units in this estate.</p>
                ) : (
                  <ul className="divide-y divide-stone-surface">
                    {units.map((u) => (
                      <li key={u.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-stone-surface/40">
                          <input type="checkbox" className="h-4 w-4" checked={selected.has(u.id)} onChange={() => toggleUnit(u.id)} />
                          <span className="text-sm text-graphite">Unit {u.unitNumber}{u.block ? ` · Block ${u.block}` : ''}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="act">Action</Label>
              <select id="act" className={selectClass} value={action} onChange={(e) => setAction(e.target.value as any)}>
                <option value="activate">Activate</option>
                <option value="deactivate">Deactivate</option>
              </select>
            </div>
            {action === 'activate' && (
              <label className="flex items-end gap-3 pb-1.5">
                <input type="checkbox" className="h-4 w-4" checked={attachIfMissing} onChange={(e) => setAttachIfMissing(e.target.checked)} />
                <span className="text-sm text-graphite">
                  Attach to units that don&rsquo;t have it yet
                  <span className="block text-caption text-muted-foreground">Otherwise only already-attached units are activated.</span>
                </span>
              </label>
            )}
          </div>

          <div className="flex justify-end border-t border-stone-surface pt-4">
            <Button onClick={runPreview} disabled={!canRun || busy}><Eye className="mr-1.5 h-4 w-4" />Preview</Button>
          </div>
        </CardContent></Card>
      )}

      <Drawer open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>{action === 'activate' ? 'Activate' : 'Deactivate'} {selectedType?.name}</DrawerTitle>
            {preview && (
              <p className="text-caption text-muted-foreground">
                {preview.totalUnits} unit(s) targeted · {preview.attachedActive} already active · {preview.attachedInactive} paused · {preview.notAttached} not attached.
              </p>
            )}
          </DrawerHeader>
          <DrawerBody className="space-y-3">
            {preview && (
              <>
                <div className="rounded-lg bg-stone-surface/40 p-3 text-caption text-graphite">
                  {action === 'activate' ? (
                    attachIfMissing
                      ? <>Will activate paused units and attach + activate the {preview.notAttached} not yet carrying this charge.</>
                      : <>Will activate the {preview.attachedInactive} paused unit(s). The {preview.notAttached} without this charge are skipped.</>
                  ) : (
                    <>Will deactivate the {preview.attachedActive} active unit(s).</>
                  )}
                </div>
                {preview.sampleUnits?.length > 0 && (
                  <ul className="space-y-1 text-caption text-muted-foreground">
                    {preview.sampleUnits.map((u: any) => (
                      <li key={u.id}>{u.estateName} · Unit {u.unitNumber}</li>
                    ))}
                    {preview.totalUnits > preview.sampleUnits.length && (
                      <li className="text-muted-foreground">…and {preview.totalUnits - preview.sampleUnits.length} more</li>
                    )}
                  </ul>
                )}
              </>
            )}
          </DrawerBody>
          <DrawerFooter>
            <Button onClick={apply} disabled={busy}>
              {busy ? 'Applying…' : action === 'activate' ? 'Activate' : 'Deactivate'}
            </Button>
            <Button variant="secondary" onClick={() => setPreview(null)}>Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
