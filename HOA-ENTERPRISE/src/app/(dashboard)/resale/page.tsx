'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const statusFilters = ['all', 'draft', 'issued', 'cancelled'] as const;
const statusBadge: Record<string, 'muted' | 'info' | 'success' | 'destructive' | 'warning'> = {
  draft: 'muted',
  issued: 'success',
  superseded: 'warning',
  cancelled: 'destructive',
};

export default function ResaleListPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<typeof statusFilters[number]>('all');

  const load = () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    setLoading(true);
    api.get<any>(`/resale${params.toString() ? `?${params}` : ''}`).then((r) => setItems(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Resale documents</h1>
          <p className="mt-1 text-body text-muted-foreground">Transfer certificates and disclosure packs for unit sales. Public links share with attorneys without login.</p>
        </div>
        <Link href="/resale/new"><Button><Plus className="mr-1.5 h-4 w-4" />New certificate</Button></Link>
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
              <FileText className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No resale certificates</p>
            <p className="text-caption text-muted-foreground">Create one when a unit is being sold.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Certificate #</th>
                  <th className="px-6 py-3">Unit</th>
                  <th className="px-6 py-3">Buyer</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3">Standing</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r: any, idx: number) => (
                  <tr key={r.id}
                    className={cn('group cursor-pointer hover:bg-stone-surface/50 transition-colors', idx !== items.length - 1 && 'border-b border-stone-surface')}
                    onClick={() => router.push(`/resale/${r.id}`)}>
                    <td className="px-6 py-3 text-graphite font-mono">{r.certificateNumber}</td>
                    <td className="px-6 py-3 text-graphite">{r.unit?.estate?.name} · Unit {r.unit?.unitNumber}</td>
                    <td className="px-6 py-3 text-muted-foreground">{r.buyer?.fullName || '—'}</td>
                    <td className="px-6 py-3 text-muted-foreground">{formatDate(r.createdAt)}</td>
                    <td className="px-6 py-3">{r.goodStanding ? <Badge variant="success">good</Badge> : <Badge variant="warning">arrears</Badge>}</td>
                    <td className="px-6 py-3"><Badge variant={statusBadge[r.status] || 'muted'}>{r.status}</Badge></td>
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
