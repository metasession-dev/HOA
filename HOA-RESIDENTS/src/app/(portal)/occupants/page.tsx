'use client';

/**
 * Phase 10.3 — occupant management.
 *
 * Owners can add tenants, dependents, and caretakers to their unit and end
 * the occupancy when someone moves out. Read-only for non-owners (the API
 * returns an empty list).
 */
import { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';

interface Occupant {
  id: string;
  role: 'owner' | 'tenant';
  unitId: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  unit: { id: string; unitNumber: string; block: string | null };
  person: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; userId: string | null };
}

export default function OccupantsPage() {
  const [items, setItems] = useState<Occupant[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{
    unitId: string;
    role: 'tenant' | 'dependent' | 'caretaker';
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }>({ unitId: '', role: 'tenant', firstName: '', lastName: '', email: '', phone: '' });
  const confirm = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/me/occupants');
      setItems(r.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Distinct units owned by the resident — used to populate the add form.
  const myUnits = Array.from(
    new Map(items.filter((i) => i.role === 'owner').map((i) => [i.unitId, i.unit])).values(),
  );

  const submitAdd = async () => {
    if (!form.unitId || !form.firstName || !form.lastName) {
      toast({ variant: 'error', title: 'Missing required fields' });
      return;
    }
    setAdding(true);
    try {
      await api.post('/me/occupants', {
        unitId: form.unitId,
        role: form.role,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || undefined,
        phone: form.phone || undefined,
      });
      toast({ title: 'Occupant added' });
      setForm({ unitId: '', role: 'tenant', firstName: '', lastName: '', email: '', phone: '' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Add failed', description: err.message });
    } finally {
      setAdding(false);
    }
  };

  const endOccupancy = async (occ: Occupant) => {
    const ok = await confirm({
      title: 'End occupancy?',
      description: `${occ.person.firstName} ${occ.person.lastName} will no longer be listed as living at this unit.`,
      confirmText: 'End',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/me/occupants/${occ.id}`);
      toast({ title: 'Occupancy ended' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-charcoal-primary">Occupants</h1>
        <p className="text-sm text-muted-foreground">
          The people who live at your unit. Add tenants, dependents and caretakers so they can be reached for community matters.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <section className="space-y-2">
          {items.length === 0 && (
            <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-muted-foreground">
              No occupants on file yet.
            </p>
          )}
          {items.map((o) => (
            <article
              key={o.id}
              className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-stone-900">
                  {o.person.firstName} {o.person.lastName}{' '}
                  <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-stone-600">
                    {o.role}
                  </span>
                </p>
                <p className="text-xs text-stone-500">
                  Unit {o.unit.unitNumber}
                  {o.unit.block ? ` · Block ${o.unit.block}` : ''}
                  {o.person.email ? ` · ${o.person.email}` : ''}
                  {o.person.phone ? ` · ${o.person.phone}` : ''}
                </p>
              </div>
              {o.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => endOccupancy(o)}
                  aria-label="End occupancy"
                  className="ml-3 rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </article>
          ))}
        </section>
      )}

      {myUnits.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="font-medium text-stone-900">Add a new occupant</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-stone-600">Unit</span>
              <select
                value={form.unitId}
                onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
              >
                <option value="">— select —</option>
                {myUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.unitNumber}
                    {u.block ? ` (Block ${u.block})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-600">Role</span>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as 'tenant' | 'dependent' | 'caretaker' })}
                className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
              >
                <option value="tenant">Tenant</option>
                <option value="dependent">Dependent</option>
                <option value="caretaker">Caretaker</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-600">First name</span>
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-600">Last name</span>
              <input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-600">Email (optional)</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-600">Phone (optional)</span>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={submitAdd} disabled={adding}>
              {adding ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
              Add occupant
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
