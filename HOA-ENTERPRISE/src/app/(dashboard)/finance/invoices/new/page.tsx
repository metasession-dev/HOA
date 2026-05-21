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

export default function NewInvoicePage() {
  const router = useRouter();
  const [estates, setEstates] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedEstateId, setSelectedEstateId] = useState('');
  const [form, setForm] = useState({ unitId: '', dueDate: '', notes: '', type: 'recurring' });
  const [lineItems, setLineItems] = useState([{ description: 'Monthly Levy', amount: 0, quantity: 1 }]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<any>('/estates').then((res) => setEstates(res.data || []));
  }, []);

  useEffect(() => {
    if (selectedEstateId) {
      api.get<any>(`/estates/${selectedEstateId}/units`).then((res) => setUnits(res.data || []));
    } else {
      setUnits([]);
    }
  }, [selectedEstateId]);

  const addLineItem = () =>
    setLineItems([...lineItems, { description: '', amount: 0, quantity: 1 }]);
  const removeLineItem = (idx: number) =>
    setLineItems(lineItems.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: string, value: any) => {
    const updated = [...lineItems];
    (updated[idx] as any)[field] = value;
    setLineItems(updated);
  };

  const total = lineItems.reduce((sum, item) => sum + item.amount * item.quantity, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/invoices', { ...form, lineItems });
      toast({ variant: 'success', title: 'Invoice created' });
      router.push('/finance/invoices');
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not create invoice', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="estate">Estate</Label>
                <select
                  id="estate"
                  className={selectClass}
                  value={selectedEstateId}
                  onChange={(e) => setSelectedEstateId(e.target.value)}
                  required
                >
                  <option value="">Select estate…</option>
                  {estates.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
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
                    {selectedEstateId ? 'Select unit…' : 'Pick an estate first'}
                  </option>
                  {units.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      Unit {u.unitNumber}
                      {u.block ? ` · Block ${u.block}` : ''}
                    </option>
                  ))}
                </select>
              </div>
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
                  <option value="recurring">Recurring levy</option>
                  <option value="one_time">One-time charge</option>
                  <option value="fine">Fine</option>
                  <option value="special">Special levy</option>
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

            <div className="space-y-3">
              {lineItems.map((item, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-12 items-end">
                  <div className="sm:col-span-6 space-y-1.5">
                    {idx === 0 && <Label>Description</Label>}
                    <Input
                      placeholder="e.g. Monthly Levy — April"
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                      required
                    />
                  </div>
                  <div className="sm:col-span-3 space-y-1.5">
                    {idx === 0 && <Label>Amount</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={item.amount || ''}
                      onChange={(e) => updateLineItem(idx, 'amount', parseFloat(e.target.value) || 0)}
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
