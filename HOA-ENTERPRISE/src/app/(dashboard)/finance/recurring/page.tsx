'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Plus, Play, Eye, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, getOrgCurrency, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

type Schedule = {
  id: string;
  name: string;
  description?: string;
  frequency: string;
  billingDayOfMonth: number;
  dueDays: number;
  amount: string | null;
  currency: string;
  lineItems: any[];
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  _count?: { invoices: number; runs: number };
};

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

// Same presets as the manual invoice form so recurring schedules read identically.
const LINE_ITEM_PRESETS = [
  'Monthly levy',
  'Special levy',
  'Reserve fund contribution',
  'Water charge',
  'Electricity charge',
  'Sewerage charge',
  'Refuse / waste collection',
  'Security levy',
  'Maintenance fee',
  'Insurance contribution',
  'Administration fee',
];

type RecurringLineItem = { description: string; amount: number; quantity: number };

export default function RecurringSchedulesPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  // Currency is taken from org Settings at save time — see `create()`.
  const [form, setForm] = useState({ name: '', frequency: 'monthly', billingDayOfMonth: '1', dueDays: '30', description: '', billingTypeId: '' });
  // Line items the generated invoices carry. Previously the form only sent a
  // flat `amount`, so generated invoices had an amount but no itemisation —
  // this is the "line item is missing" bug.
  const [lineItems, setLineItems] = useState<RecurringLineItem[]>([{ description: 'Monthly levy', amount: 0, quantity: 1 }]);
  const [previewing, setPreviewing] = useState<{ id: string; data: any } | null>(null);
  // Billing catalog names feed the line-item suggestions (Phase 1 of
  // unit-default-billing). Falls back to the static presets when empty.
  const [catalogNames, setCatalogNames] = useState<string[]>([]);
  // Full active catalog — used to optionally LINK a schedule to a catalog charge.
  // Linking makes the schedule the sole biller of that charge; the API then
  // blocks billing it per-unit (Billing activation / Generate charges) so the
  // two paths can never double-bill.
  const [catalog, setCatalog] = useState<{ id: string; name: string; baseTerm: string }[]>([]);

  const blankForm = { name: '', frequency: 'monthly', billingDayOfMonth: '1', dueDays: '30', description: '', billingTypeId: '' };
  const addLineItem = () => setLineItems((li) => [...li, { description: '', amount: 0, quantity: 1 }]);
  const removeLineItem = (idx: number) => setLineItems((li) => li.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: keyof RecurringLineItem, value: any) =>
    setLineItems((li) => li.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  const lineItemsTotal = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0) * (li.quantity || 1), 0);

  const load = () => {
    setLoading(true);
    api.get<any>('/billing/recurring').then((r) => setItems(r.data || []))
      .catch((err) => toast({ variant: 'error', title: 'Failed', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.get<any>('/billing/catalog')
      .then((r) => {
        const active = (r.data || []).filter((t: any) => t.isActive);
        setCatalogNames(active.map((t: any) => t.name));
        setCatalog(active.map((t: any) => ({ id: t.id, name: t.name, baseTerm: t.baseTerm })));
      })
      .catch(() => { /* suggestions are best-effort */ });
  }, []);
  const lineItemOptions = Array.from(new Set([...catalogNames, ...LINE_ITEM_PRESETS]));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate line items before showing the busy state so feedback is instant.
    const cleanItems = lineItems
      .map((li) => ({ description: li.description.trim(), amount: Number(li.amount) || 0, quantity: li.quantity || 1 }))
      .filter((li) => li.description);
    if (cleanItems.length === 0) {
      toast({ variant: 'error', title: 'Add a line item', description: 'Each schedule needs at least one line item with a description.' });
      return;
    }
    if (cleanItems.some((li) => !(li.amount > 0))) {
      toast({ variant: 'error', title: 'Check the amounts', description: 'Each line item needs an amount greater than zero.' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/billing/recurring', {
        name: form.name,
        frequency: form.frequency,
        billingDayOfMonth: Number(form.billingDayOfMonth),
        dueDays: Number(form.dueDays),
        // Generated invoices carry these line items (the API derives the
        // invoice total as the sum of amount × quantity).
        lineItems: cleanItems,
        // Always use the org currency from Settings — no per-form override.
        currency: getOrgCurrency(),
        description: form.description || undefined,
        // Optional link to a catalog charge — when set, this schedule becomes the
        // sole biller of that charge (per-unit billing for it is blocked).
        billingTypeId: form.billingTypeId || undefined,
      });
      toast({ variant: 'success', title: 'Schedule created' });
      setShowNew(false);
      setForm(blankForm);
      setLineItems([{ description: 'Monthly levy', amount: 0, quantity: 1 }]);
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const preview = async (s: Schedule) => {
    try {
      const r = await api.get<any>(`/billing/recurring/${s.id}/preview`);
      setPreviewing({ id: s.id, data: r.data });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Preview failed', description: err.message });
    }
  };

  const run = async (s: Schedule) => {
    const ok = await confirm({
      title: `Run "${s.name}" now?`,
      description: 'This will generate invoices for the current period (idempotent — duplicates are skipped).',
      confirmText: 'Run',
    });
    if (!ok) return;
    try {
      const idemp = `run-${s.id}-${Date.now()}`;
      const r = await api.post<any>(`/billing/recurring/${s.id}/run`, {}, idemp);
      toast({ variant: 'success', title: 'Run complete', description: `${r.data.createdInvoices} created · ${r.data.skippedDuplicates} skipped` });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const toggleActive = async (s: Schedule) => {
    try {
      await api.put(`/billing/recurring/${s.id}`, { isActive: !s.isActive, name: s.name, frequency: s.frequency });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Recurring billing</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Monthly/quarterly/annual schedules that issue invoices to your residents on a fixed cadence.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus className="mr-1.5 h-4 w-4" />New schedule</Button>
      </header>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface text-graphite">
              <RefreshCw className="h-5 w-5" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No schedules yet</p>
            <p className="text-caption text-muted-foreground">Create one to auto-issue your monthly levy.</p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-surface">
            {items.map((s) => (
              <li key={s.id} className="p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-charcoal-primary">{s.name}</span>
                    <Badge variant="info">{s.frequency}</Badge>
                    {s.isActive ? <Badge variant="success">active</Badge> : <Badge variant="muted">paused</Badge>}
                  </div>
                  <p className="mt-1 text-caption text-muted-foreground">
                    {s.amount ? `${s.amount} ${s.currency}` : `${s.lineItems?.length || 0} line items`}
                    {` · billed day ${s.billingDayOfMonth}, due in ${s.dueDays} days`}
                    {s.nextRunAt && ` · next run ${formatDate(s.nextRunAt)}`}
                    {s.lastRunAt && ` · last run ${formatDate(s.lastRunAt)}`}
                  </p>
                  {s._count && (
                    <p className="text-caption text-muted-foreground mt-0.5">
                      {s._count.invoices} invoice(s) generated to date · {s._count.runs} run(s)
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => preview(s)}><Eye className="mr-1 h-3.5 w-3.5" />Preview</Button>
                  <Button size="sm" variant="secondary" onClick={() => run(s)} disabled={!s.isActive}><Play className="mr-1 h-3.5 w-3.5" />Run now</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(s)}>{s.isActive ? 'Pause' : 'Resume'}</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      <Drawer open={showNew} onOpenChange={setShowNew}>
        <DrawerContent size="md">
          <form onSubmit={create} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>New recurring schedule</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sn">Name</Label>
                <Input id="sn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Monthly levy" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sf">Frequency</Label>
                  <select id="sf" className={selectClass} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sd">Billing day</Label>
                  <Input id="sd" type="number" min="1" max="31" value={form.billingDayOfMonth} onChange={(e) => setForm({ ...form, billingDayOfMonth: e.target.value })} />
                </div>
              </div>
              {/*
               * Line items — generated invoices copy these verbatim and the
               * API derives the invoice total from them. No currency input:
               * the org currency from Settings is applied on save.
               */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Line items</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addLineItem}>
                    <Plus className="mr-1 h-3.5 w-3.5" />Add
                  </Button>
                </div>
                <datalist id="recurring-line-items">
                  {lineItemOptions.map((o) => <option key={o} value={o} />)}
                </datalist>
                {lineItems.map((item, idx) => (
                  <div key={idx} className="space-y-2 rounded-lg border border-stone-surface p-2.5">
                    <Input
                      placeholder="Description…"
                      list="recurring-line-items"
                      autoComplete="off"
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                      required
                    />
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-caption text-muted-foreground">Amount</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={item.amount || ''}
                          onChange={(e) => updateLineItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                          required
                        />
                      </div>
                      <div className="w-20 space-y-1">
                        <Label className="text-caption text-muted-foreground">Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      {lineItems.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeLineItem(idx)} title="Remove line">
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-coral-red" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-stone-surface pt-2">
                  <span className="text-caption text-muted-foreground">Total per invoice</span>
                  <span className="font-medium tabular-nums text-charcoal-primary">{formatCurrency(lineItemsTotal, getOrgCurrency())}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sdue">Due in (days)</Label>
                <Input id="sdue" type="number" min="0" max="180" value={form.dueDays} onChange={(e) => setForm({ ...form, dueDays: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sdesc">Description (optional)</Label>
                <Input id="sdesc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {catalog.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="sbt">Linked catalog charge (optional)</Label>
                  <select id="sbt" className={selectClass} value={form.billingTypeId} onChange={(e) => setForm({ ...form, billingTypeId: e.target.value })}>
                    <option value="">Not linked — standalone schedule</option>
                    {catalog.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <p className="text-caption text-muted-foreground">
                    Link this schedule to a billing-catalog charge to make it the sole biller of that charge.
                    Per-unit billing for the charge (Billing activation / Generate charges) is then blocked, so the two paths can never double-bill.
                  </p>
                </div>
              )}
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={busy}>Create</Button>
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      <Drawer open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>Preview for {previewing?.data.periodKey}</DrawerTitle>
            {previewing && (
              <p className="text-caption text-muted-foreground">
                {previewing.data.totalUnits} unit(s) targeted · {previewing.data.alreadyBilled} already billed · {previewing.data.toBill} to bill.
              </p>
            )}
          </DrawerHeader>
          <DrawerBody className="space-y-3">
            {previewing && (
              <>
                <p className="text-caption text-graphite">Amount: <strong className="text-charcoal-primary">{previewing.data.amount} {previewing.data.currency}</strong></p>
                {previewing.data.sampleUnits?.length > 0 && (
                  <ul className="text-caption text-muted-foreground space-y-1">
                    {previewing.data.sampleUnits.map((u: any) => (
                      <li key={u.id}>
                        {u.estateName} #{u.unitNumber} {u.alreadyBilled && <Badge variant="muted">already billed</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </DrawerBody>
          <DrawerFooter>
            <Button size="sm" variant="secondary" onClick={() => setPreviewing(null)}>Close</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
