'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Plus, Play, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, getOrgCurrency } from '@/lib/utils';
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

export default function RecurringSchedulesPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  // Currency is taken from org Settings at save time — see `create()`.
  const [form, setForm] = useState({ name: '', frequency: 'monthly', billingDayOfMonth: '1', dueDays: '30', amount: '', description: '' });
  const [previewing, setPreviewing] = useState<{ id: string; data: any } | null>(null);

  const load = () => {
    setLoading(true);
    api.get<any>('/billing/recurring').then((r) => setItems(r.data || []))
      .catch((err) => toast({ variant: 'error', title: 'Failed', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/billing/recurring', {
        name: form.name,
        frequency: form.frequency,
        billingDayOfMonth: Number(form.billingDayOfMonth),
        dueDays: Number(form.dueDays),
        amount: form.amount ? Number(form.amount) : undefined,
        // Always use the org currency from Settings — no per-form override.
        currency: getOrgCurrency(),
        description: form.description || undefined,
      });
      toast({ variant: 'success', title: 'Schedule created' });
      setShowNew(false);
      setForm({ name: '', frequency: 'monthly', billingDayOfMonth: '1', dueDays: '30', amount: '', description: '' });
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
              <div className="space-y-1.5">
                <Label htmlFor="sa">Amount</Label>
                <Input
                  id="sa"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
                {/*
                 * No currency input here — the org currency from Settings is
                 * applied on save (see `currency: getOrgCurrency()` in the
                 * submit payload below). One less field to mis-key.
                 */}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sdue">Due in (days)</Label>
                <Input id="sdue" type="number" min="0" max="180" value={form.dueDays} onChange={(e) => setForm({ ...form, dueDays: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sdesc">Description (optional)</Label>
                <Input id="sdesc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
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
