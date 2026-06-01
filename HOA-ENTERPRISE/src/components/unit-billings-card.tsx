'use client';

/**
 * Per-unit billings (Phase 2 of unit-default-billing). Lists the catalog charges
 * attached to a unit and lets an admin pause/resume each one. Self-contained: it
 * fetches its own data so the unit detail page doesn't need to thread it through.
 */
import { useCallback, useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, getOrgCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/use-toast';

const TERM_LABEL: Record<string, string> = {
  daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', biannual: '6 months', annual: 'year',
};

type UnitBilling = {
  id: string;
  amount: string;
  baseTerm: string;
  currency: string;
  isActive: boolean;
  billingType: { id: string; name: string; key: string; baseTerm: string; isActive: boolean };
};

export function UnitBillingsCard({ unitId }: { unitId: string }) {
  const [items, setItems] = useState<UnitBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<any>(`/billing/units/${unitId}/billings`)
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (b: UnitBilling) => {
    setBusyId(b.id);
    try {
      await api.put(`/billing/unit-billings/${b.id}`, { isActive: !b.isActive });
      toast({ variant: 'success', title: b.isActive ? 'Paused' : 'Resumed' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1.5 text-heading-sm font-display font-medium text-charcoal-primary">
          <Repeat className="h-3.5 w-3.5 text-muted-foreground" />Billings
        </h2>
      </div>
      {loading ? (
        <Card><CardContent className="space-y-2 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-10" />)}</CardContent></Card>
      ) : items.length === 0 ? (
        <EmptyState
          variant="card"
          icon={Repeat}
          title="No billings attached"
          description="Charges from your billing catalog appear here once attached to this unit."
        />
      ) : (
        <Card><CardContent className="p-0">
          <ul className="divide-y divide-stone-surface">
            {items.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-charcoal-primary">{b.billingType?.name}</span>
                    {b.isActive
                      ? <Badge variant="success">active</Badge>
                      : <Badge variant="muted">paused</Badge>}
                  </div>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {formatCurrency(Number(b.amount), b.currency || getOrgCurrency())} / {TERM_LABEL[b.baseTerm] || b.baseTerm}
                  </p>
                </div>
                <Button size="sm" variant="ghost" disabled={busyId === b.id} onClick={() => toggle(b)}>
                  {b.isActive ? 'Pause' : 'Resume'}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}
    </section>
  );
}
