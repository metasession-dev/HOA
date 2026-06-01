'use client';

/**
 * Billing catalog — Phase 1 of unit-default-billing
 * (see HOA-DOCS/SPEC-unit-default-billing.md).
 *
 * Admins define the recurring charge types a unit can carry (water, service
 * charge, association dues, …): their canonical price and the term that price is
 * understood per. Later phases attach these to units, generate per-period
 * invoices, and let residents prepay arbitrary terms. This page is the catalog
 * CRUD; it has no billing side-effects yet.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Pencil, Archive, Tags } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatCurrency, getOrgCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter,
} from '@/components/ui/drawer';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

const TERMS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'biannual', label: 'Bi-annual' },
  { value: 'annual', label: 'Annual' },
];
const termLabel = (v: string) => TERMS.find((t) => t.value === v)?.label || v;

const PRORATION = [
  { value: 'whole_period', label: 'Whole periods only', hint: 'Residents buy N whole base periods. Best for dues / service charge.' },
  { value: 'calendar_day', label: 'Per calendar day', hint: 'Prorate by exact days. Best for water / metered charges.' },
  { value: 'thirty_day', label: 'Per 30-day month', hint: 'Prorate using a fixed 30-day month.' },
];

type BillingType = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  defaultAmount: string;
  baseTerm: string;
  currency: string | null;
  prorationMode: string;
  allowResidentPrepay: boolean;
  attachByDefault: boolean;
  sortOrder: number;
  isActive: boolean;
};

// The three charges every unit is expected to carry — offered as a one-click
// seed when the catalog is empty.
const STANDARD_SET = [
  { key: 'water', name: 'Water bill', baseTerm: 'monthly', prorationMode: 'calendar_day' },
  { key: 'service_charge', name: 'Service charge', baseTerm: 'monthly', prorationMode: 'whole_period' },
  { key: 'association_dues', name: 'Association dues', baseTerm: 'monthly', prorationMode: 'whole_period' },
];

const emptyForm = {
  name: '',
  key: '',
  description: '',
  defaultAmount: '',
  baseTerm: 'monthly',
  currency: '',
  prorationMode: 'whole_period',
  allowResidentPrepay: true,
  attachByDefault: true,
};

export default function BillingCatalogPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<BillingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    setLoading(true);
    api.get<any>('/billing/catalog')
      .then((r) => setItems(r.data || []))
      .catch((err) => toast({ variant: 'error', title: 'Could not load catalog', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (t: BillingType) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      key: t.key,
      description: t.description || '',
      defaultAmount: String(t.defaultAmount ?? ''),
      baseTerm: t.baseTerm,
      currency: t.currency || '',
      prorationMode: t.prorationMode,
      allowResidentPrepay: t.allowResidentPrepay,
      attachByDefault: t.attachByDefault,
    });
    setDrawerOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(Number(form.defaultAmount) > 0)) {
      toast({ variant: 'error', title: 'Enter a price', description: 'Default amount must be greater than zero.' });
      return;
    }
    setBusy(true);
    const payload: any = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      defaultAmount: Number(form.defaultAmount),
      baseTerm: form.baseTerm,
      currency: form.currency.trim() ? form.currency.trim().toUpperCase() : null,
      prorationMode: form.prorationMode,
      allowResidentPrepay: form.allowResidentPrepay,
      attachByDefault: form.attachByDefault,
    };
    try {
      if (editingId) {
        await api.put(`/billing/catalog/${editingId}`, payload);
      } else {
        // key is optional on create (derived from name) but we send it when the
        // admin typed one so the slug is predictable.
        if (form.key.trim()) payload.key = form.key.trim();
        await api.post('/billing/catalog', payload);
      }
      toast({ variant: 'success', title: editingId ? 'Billing type updated' : 'Billing type created' });
      setDrawerOpen(false);
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const archive = async (t: BillingType) => {
    const ok = await confirm({
      title: `Archive "${t.name}"?`,
      description: 'It will no longer be offered for new units. Existing references are kept.',
      confirmText: 'Archive',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/billing/catalog/${t.id}`);
      toast({ variant: 'success', title: 'Archived' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const seedStandard = async () => {
    setBusy(true);
    try {
      for (const s of STANDARD_SET) {
        await api.post('/billing/catalog', {
          key: s.key,
          name: s.name,
          defaultAmount: 0,
          baseTerm: s.baseTerm,
          prorationMode: s.prorationMode,
          currency: null,
          allowResidentPrepay: true,
          attachByDefault: true,
        });
      }
      toast({ variant: 'success', title: 'Standard charges added', description: 'Set a price on each before using them.' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not add defaults', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/settings" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Settings
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Billing catalog</h1>
          <p className="mt-1 text-body text-muted-foreground">
            The recurring charges a unit can carry — water, service charge, association dues and any custom levies.
            Set the price and the term it&rsquo;s billed on.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />New billing type</Button>
      </header>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface text-graphite">
              <Tags className="h-5 w-5" />
            </div>
            <p className="mt-3 text-body font-medium text-charcoal-primary">No billing types yet</p>
            <p className="text-caption text-muted-foreground">Add the standard charges, then set their prices.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={seedStandard} disabled={busy}>Add water, service charge &amp; dues</Button>
              <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />New billing type</Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-stone-surface">
            {items.map((t) => (
              <li key={t.id} className={cn('flex flex-wrap items-start justify-between gap-3 p-4', !t.isActive && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-charcoal-primary">{t.name}</span>
                    <span className="font-mono text-caption text-muted-foreground">{t.key}</span>
                    <Badge variant="info">{termLabel(t.baseTerm)}</Badge>
                    {!t.isActive && <Badge variant="muted">archived</Badge>}
                    {t.attachByDefault && t.isActive && <Badge variant="success">auto-attach</Badge>}
                  </div>
                  <p className="mt-1 text-caption text-muted-foreground">
                    {formatCurrency(Number(t.defaultAmount), t.currency || getOrgCurrency())} / {termLabel(t.baseTerm).toLowerCase()}
                    {' · '}{PRORATION.find((p) => p.value === t.prorationMode)?.label || t.prorationMode}
                    {' · '}{t.allowResidentPrepay ? 'residents can prepay' : 'no resident prepay'}
                  </p>
                  {t.description && <p className="mt-0.5 text-caption text-muted-foreground">{t.description}</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                  {t.isActive && (
                    <Button size="sm" variant="ghost" onClick={() => archive(t)}><Archive className="mr-1 h-3.5 w-3.5" />Archive</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent size="md">
          <form onSubmit={save} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>{editingId ? 'Edit billing type' : 'New billing type'}</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bt-name">Name</Label>
                <Input id="bt-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Water bill" required />
              </div>

              {!editingId && (
                <div className="space-y-1.5">
                  <Label htmlFor="bt-key">Key (optional)</Label>
                  <Input id="bt-key" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="auto-generated from name" autoComplete="off" />
                  <p className="text-caption text-muted-foreground">A stable identifier used in reports. Cannot be changed later.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bt-amount">Default price</Label>
                  <Input id="bt-amount" type="number" step="0.01" min="0" value={form.defaultAmount} onChange={(e) => setForm({ ...form, defaultAmount: e.target.value })} placeholder="0.00" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bt-term">Billed per</Label>
                  <select id="bt-term" className={selectClass} value={form.baseTerm} onChange={(e) => setForm({ ...form, baseTerm: e.target.value })}>
                    {TERMS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bt-proration">When billed for a partial/custom term</Label>
                <select id="bt-proration" className={selectClass} value={form.prorationMode} onChange={(e) => setForm({ ...form, prorationMode: e.target.value })}>
                  {PRORATION.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <p className="text-caption text-muted-foreground">{PRORATION.find((p) => p.value === form.prorationMode)?.hint}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bt-currency">Currency (optional)</Label>
                <Input id="bt-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder={`Default — ${getOrgCurrency()}`} maxLength={3} />
                <p className="text-caption text-muted-foreground">Leave blank to use your organisation currency.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bt-desc">Description (optional)</Label>
                <Input id="bt-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Shown to residents" />
              </div>

              <label className="flex items-center gap-3 rounded-lg bg-stone-surface/40 p-3">
                <input type="checkbox" className="h-4 w-4" checked={form.attachByDefault} onChange={(e) => setForm({ ...form, attachByDefault: e.target.checked })} />
                <span className="text-sm text-graphite">
                  Attach to new units automatically
                  <span className="block text-caption text-muted-foreground">New units get this charge when they&rsquo;re created.</span>
                </span>
              </label>

              <label className="flex items-center gap-3 rounded-lg bg-stone-surface/40 p-3">
                <input type="checkbox" className="h-4 w-4" checked={form.allowResidentPrepay} onChange={(e) => setForm({ ...form, allowResidentPrepay: e.target.checked })} />
                <span className="text-sm text-graphite">
                  Let residents prepay any term
                  <span className="block text-caption text-muted-foreground">Residents can pay several periods of this charge in advance.</span>
                </span>
              </label>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={busy}>{editingId ? 'Save changes' : 'Create'}</Button>
              <Button type="button" variant="secondary" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
