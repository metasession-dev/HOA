'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const statusFilters = ['all', 'draft', 'active', 'closed'] as const;
const statusBadge: Record<string, 'muted' | 'info' | 'success' | 'destructive'> = {
  draft: 'muted',
  active: 'success',
  closed: 'info',
};

export default function BudgetsListPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<typeof statusFilters[number]>('all');

  const load = () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    setLoading(true);
    api.get<any>(`/finance/budgets${params.toString() ? `?${params}` : ''}`).then((r) => setItems(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Budgets</h1>
          <p className="mt-1 text-body text-muted-foreground">Plan annual income and expenditure per fund. Track variance against actuals.</p>
        </div>
        <Link href="/finance/budgets/new"><Button><Plus className="mr-1.5 h-4 w-4" />New budget</Button></Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {statusFilters.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn('rounded-pill px-3 py-1 text-caption font-medium transition-colors capitalize',
              statusFilter === s ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone')}>
            {s}
          </button>
        ))}
      </div>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
              <ClipboardList className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No budgets yet</p>
            <p className="text-caption text-muted-foreground">Create a budget for the current fiscal year to track variance.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Year</th>
                  <th className="px-6 py-3">Fund</th>
                  <th className="px-6 py-3">Lines</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b, idx) => (
                  <tr key={b.id}
                    className={cn('cursor-pointer hover:bg-stone-surface/50 transition-colors', idx !== items.length - 1 && 'border-b border-stone-surface')}
                    onClick={() => router.push(`/finance/budgets/${b.id}`)}>
                    <td className="px-6 py-3 text-graphite font-medium">{b.name}</td>
                    <td className="px-6 py-3 text-muted-foreground">{b.fiscalYear}</td>
                    <td className="px-6 py-3 text-muted-foreground">{b.fund?.name || '—'}</td>
                    <td className="px-6 py-3 text-muted-foreground">{b.lines.length}</td>
                    <td className="px-6 py-3"><Badge variant={statusBadge[b.status] || 'muted'}>{b.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
