'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

// Common HOA invoice line items offered as a dropdown. The field is still a
// free-text input (via <datalist>), so any custom description is allowed.
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
  'Garden / landscaping service',
  'Insurance contribution',
  'Administration fee',
  'Clubhouse / facility booking',
  'Access tag / card replacement',
  'Fine / penalty',
  'Late payment fee',
  'Interest on arrears',
];

// Turn NestJS/class-validator's technical message list (e.g.
// "lineItems.0.unitPrice must be a number…") into something a person can act on.
function friendlyInvoiceError(err: any): string {
  const raw: string = err?.message || '';
  if (/lineItems|unitPrice|should not exist|must be a number/i.test(raw)) {
    return 'Please check each line item has a description, a quantity, and an amount greater than zero.';
  }
  if (/dueDate/i.test(raw)) return 'Please choose a valid due date.';
  if (/unitId/i.test(raw)) return 'Please select a unit for this invoice.';
  return raw || 'Something went wrong. Please try again.';
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [units, setUnits] = useState<any[]>([]);
  // Single-estate-per-enterprise: the estate is resolved automatically, so the
  // form only asks for the unit.
  const [selectedEstateId, setSelectedEstateId] = useState('');
  const [form, setForm] = useState({ unitId: '', dueDate: '', notes: '', type: 'levy' });
  const [lineItems, setLineItems] = useState([{ description: 'Monthly Levy', unitPrice: 0, quantity: 1 }]);
  const [loading, setLoading] = useState(false);
  // Billing catalog names feed the line-item suggestions (Phase 1 of
  // unit-default-billing). Falls back to the static presets when empty.
  const [catalogNames, setCatalogNames] = useState<string[]>([]);

  useEffect(() => {
    api.get<any>('/estates').then((res) => {
      const first = (res.data || [])[0];
      if (first) setSelectedEstateId(first.id);
    });
  }, []);

  useEffect(() => {
    api.get<any>('/billing/catalog')
      .then((r) => setCatalogNames((r.data || []).filter((t: any) => t.isActive).map((t: any) => t.name)))
      .catch(() => { /* suggestions are best-effort */ });
  }, []);

  const lineItemOptions = Array.from(new Set([...catalogNames, ...LINE_ITEM_PRESETS]));

  useEffect(() => {
    if (selectedEstateId) {
      api.get<any>(`/estates/${selectedEstateId}/units`).then((res) => setUnits(res.data || []));
    } else {
      setUnits([]);
    }
  }, [selectedEstateId]);

  const addLineItem = () =>
    setLineItems([...lineItems, { description: '', unitPrice: 0, quantity: 1 }]);
  const removeLineItem = (idx: number) =>
    setLineItems(lineItems.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: string, value: any) => {
    const updated = [...lineItems];
    (updated[idx] as any)[field] = value;
    setLineItems(updated);
  };

  const total = lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Client-side guards give clearer feedback than a raw 400 from the API.
    if (!form.unitId) {
      toast({ variant: 'error', title: 'Select a unit', description: 'Choose the unit this invoice is for.' });
      setLoading(false);
      return;
    }
    const cleanItems = lineItems
      .map((li) => ({ ...li, description: li.description.trim(), quantity: li.quantity || 1 }))
      .filter((li) => li.description);
    if (cleanItems.length === 0) {
      toast({ variant: 'error', title: 'Add a line item', description: 'Every invoice needs at least one line item with a description.' });
      setLoading(false);
      return;
    }
    if (cleanItems.some((li) => !(li.unitPrice > 0))) {
      toast({ variant: 'error', title: 'Check the amounts', description: 'Each line item needs an amount greater than zero.' });
      setLoading(false);
      return;
    }
    try {
      await api.post('/invoices', { ...form, lineItems: cleanItems });
      toast({ variant: 'success', title: 'Invoice created' });
      router.push('/finance/invoices');
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not create invoice', description: friendlyInvoiceError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/finance/invoices"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        Invoices
      </Link>

      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
          New invoice
        </h1>
        <p className="mt-1 text-body text-muted-foreground">
          Bill a unit for levies, fines or one-time charges.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">
              Invoice details
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Unit</Label>
              <select
                id="unit"
                className={selectClass}
                value={form.unitId}
                onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                required
                disabled={!selectedEstateId}
              >
                <option value="">
                  {selectedEstateId ? 'Select unit…' : 'Loading units…'}
                </option>
                {units.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.unitNumber}
                    {u.block ? ` · Block ${u.block}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dueDate">Due date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  className={selectClass}
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="levy">Recurring levy</option>
                  <option value="special">Special levy</option>
                  <option value="fine">Fine</option>
                  <option value="utility">Utility</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">
                Line items
              </h3>
              <Button type="button" variant="secondary" size="sm" onClick={addLineItem}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add line
              </Button>
            </div>

            <datalist id="invoice-line-items">
              {lineItemOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>

            <div className="space-y-3">
              {lineItems.map((item, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-12 items-end">
                  <div className="sm:col-span-6 space-y-1.5">
                    {idx === 0 && <Label>Description</Label>}
                    <Input
                      placeholder="Select or type a description…"
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                      list="invoice-line-items"
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="sm:col-span-3 space-y-1.5">
                    {idx === 0 && <Label>Amount</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={item.unitPrice || ''}
                      onChange={(e) => updateLineItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      required
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    {idx === 0 && <Label>Qty</Label>}
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    {lineItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLineItem(idx)}
                        title="Remove line"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-coral-red" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-stone-surface pt-4">
              <p className="text-caption text-muted-foreground">Total</p>
              <p className="font-display text-heading-sm font-medium text-charcoal-primary">
                {formatCurrency(total)}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create invoice'}
          </Button>
        </div>
      </form>
    </div>
  );
}
