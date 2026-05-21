'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function toIsoLocal(input: string) {
  return new Date(input).toISOString();
}

export default function NewPassPage() {
  const router = useRouter();
  const [estates, setEstates] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [estateId, setEstateId] = useState('');
  const [type, setType] = useState<string>('single_visit');
  const [form, setForm] = useState({
    unitId: '',
    visitorName: '',
    visitorPhone: '',
    vehicleReg: '',
    notes: '',
    validFrom: new Date().toISOString().slice(0, 16),
    validUntil: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16),
    maxUses: 1,
  });
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [recurringStart, setRecurringStart] = useState('08:00');
  const [recurringEnd, setRecurringEnd] = useState('17:00');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<any>('/estates')
      .then((res) => setEstates(res.data || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (estateId) {
      api
        .get<any>(`/estates/${estateId}/units`)
        .then((res) => setUnits(res.data || []))
        .catch(console.error);
    } else {
      setUnits([]);
    }
  }, [estateId]);

  const toggleDay = (d: string) => {
    setRecurringDays(recurringDays.includes(d) ? recurringDays.filter((x) => x !== d) : [...recurringDays, d]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        unitId: form.unitId,
        type,
        visitorName: form.visitorName,
        visitorPhone: form.visitorPhone || undefined,
        vehicleReg: form.vehicleReg || undefined,
        notes: form.notes || undefined,
        validFrom: toIsoLocal(form.validFrom),
        validUntil: toIsoLocal(form.validUntil),
      };
      if (type === 'event') payload.maxUses = form.maxUses;
      if (type === 'recurring') {
        payload.recurringDays = recurringDays;
        payload.recurringWindow = { start: recurringStart, end: recurringEnd };
      }

      const res: any = await api.post('/passes', payload);
      toast({ variant: 'success', title: 'Pass created', description: `Code: ${res.data.code.slice(0,4)}-${res.data.code.slice(4)}` });
      router.push(`/passes/${res.data.id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not create pass', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/passes"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        Gate passes
      </Link>

      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
          New gate pass
        </h1>
        <p className="mt-1 text-body text-muted-foreground">
          Generate a pass to share with a visitor or contractor.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Pass type</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { id: 'single_visit', label: 'Single visit' },
                { id: 'recurring', label: 'Recurring' },
                { id: 'event', label: 'Event' },
                { id: 'contractor', label: 'Contractor' },
                { id: 'delivery', label: 'Delivery' },
                { id: 'emergency', label: 'Emergency' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    type === t.id
                      ? 'bg-midnight text-white shadow-inset-stone'
                      : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">
              Visitor &amp; vehicle
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="visitorName">Visitor name</Label>
                <Input
                  id="visitorName"
                  value={form.visitorName}
                  onChange={(e) => setForm({ ...form, visitorName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitorPhone">Phone (optional)</Label>
                <Input
                  id="visitorPhone"
                  type="tel"
                  value={form.visitorPhone}
                  onChange={(e) => setForm({ ...form, visitorPhone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicleReg">Vehicle registration (optional)</Label>
              <Input
                id="vehicleReg"
                placeholder="e.g. GP-123-AB"
                value={form.vehicleReg}
                onChange={(e) => setForm({ ...form, vehicleReg: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Unit &amp; validity</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="estate">Estate</Label>
                <select
                  id="estate"
                  className={selectClass}
                  value={estateId}
                  onChange={(e) => setEstateId(e.target.value)}
                  required
                >
                  <option value="">Select estate…</option>
                  {estates.map((est: any) => (
                    <option key={est.id} value={est.id}>{est.name}</option>
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
                  disabled={!estateId}
                >
                  <option value="">{estateId ? 'Select unit…' : 'Pick an estate first'}</option>
                  {units.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      Unit {u.unitNumber}{u.block ? ` · Block ${u.block}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="validFrom">Valid from</Label>
                <Input
                  id="validFrom"
                  type="datetime-local"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="validUntil">Valid until</Label>
                <Input
                  id="validUntil"
                  type="datetime-local"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                  required
                />
              </div>
            </div>

            {type === 'event' && (
              <div className="space-y-1.5">
                <Label htmlFor="maxUses">Max entries</Label>
                <Input
                  id="maxUses"
                  type="number"
                  min={1}
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: parseInt(e.target.value) || 1 })}
                />
                <p className="text-caption text-muted-foreground">
                  This pass will allow up to this many entries (one QR code shared with all guests).
                </p>
              </div>
            )}

            {type === 'recurring' && (
              <div className="space-y-3">
                <div>
                  <Label className="mb-1.5 block">Active days</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {dayNames.map((d) => {
                      const active = recurringDays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDay(d)}
                          className={cn(
                            'rounded-pill px-3 py-1 text-xs font-medium capitalize transition-colors',
                            active
                              ? 'bg-midnight text-white'
                              : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone',
                          )}
                        >
                          {d.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="recStart">Active from</Label>
                    <Input
                      id="recStart"
                      type="time"
                      value={recurringStart}
                      onChange={(e) => setRecurringStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="recEnd">Active until</Label>
                    <Input
                      id="recEnd"
                      type="time"
                      value={recurringEnd}
                      onChange={(e) => setRecurringEnd(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <textarea
                id="notes"
                rows={3}
                className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create pass'}
          </Button>
        </div>
      </form>
    </div>
  );
}
