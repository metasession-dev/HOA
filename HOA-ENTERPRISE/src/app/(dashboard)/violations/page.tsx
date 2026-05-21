'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Plus, AlertTriangle, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const statusBadge: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary' | 'accent'> = {
  open: 'warning',
  noticed: 'info',
  acknowledged: 'muted',
  appealing: 'accent',
  board_review: 'accent',
  upheld: 'destructive',
  dismissed: 'success',
  closed: 'muted',
};

const statusFilters = ['all', 'open', 'noticed', 'acknowledged', 'appealing', 'closed'] as const;

export default function ViolationsListPage() {
  const router = useRouter();
  const [violations, setViolations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<typeof statusFilters[number]>('all');

  const load = () => {
    const q = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
    setLoading(true);
    api
      .get<any>(`/violations${q}`)
      .then((r) => setViolations(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Violations</h1>
          <p className="mt-1 text-body text-muted-foreground">
            CC&amp;R enforcement with photo evidence, notices, fines and appeals.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/violations/categories">
            <Button variant="secondary">Manage categories</Button>
          </Link>
          <Link href="/violations/new">
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              Log violation
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {statusFilters.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'rounded-pill px-3 py-1 text-caption font-medium transition-colors capitalize',
              statusFilter === s
                ? 'bg-midnight text-white'
                : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone',
            )}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : violations.length === 0 ? (
            <div className="p-10 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
                <ShieldAlert className="h-5 w-5 text-graphite" />
              </div>
              <p className="mt-3 text-body text-charcoal-primary font-medium">No violations</p>
              <p className="text-caption text-muted-foreground">
                Log a violation when a CC&amp;R breach occurs.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Occurred</th>
                    <th className="px-6 py-3">Unit</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Fine</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.map((v: any, idx: number) => (
                    <tr
                      key={v.id}
                      className={cn(
                        'group transition-colors hover:bg-stone-surface/50 cursor-pointer',
                        idx !== violations.length - 1 && 'border-b border-stone-surface',
                      )}
                      onClick={() => router.push(`/violations/${v.id}`)}
                    >
                      <td className="px-6 py-3 text-muted-foreground">{formatDate(v.occurredAt)}</td>
                      <td className="px-6 py-3 text-graphite">
                        Unit {v.unit?.unitNumber}
                        <span className="ml-1 text-muted-foreground">· {v.unit?.estate?.name}</span>
                      </td>
                      <td className="px-6 py-3 text-graphite">{v.category?.name}</td>
                      <td className="px-6 py-3 text-muted-foreground truncate max-w-xs">{v.description}</td>
                      <td className="px-6 py-3">
                        <Badge variant={statusBadge[v.status] || 'secondary'}>{v.status.replace('_', ' ')}</Badge>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {v.fineAmount ? `${v.fineCurrency} ${Number(v.fineAmount).toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg card-warm p-4 text-caption text-graphite">
        <p className="flex items-center gap-1.5 text-charcoal-primary font-medium">
          <AlertTriangle className="h-3.5 w-3.5 text-deep-amber" />
          Analytics
        </p>
        <Link href="/violations/analytics" className="mt-1 inline-block text-ember-orange hover:underline">
          View repeat-offender heatmap and by-category breakdown →
        </Link>
      </div>
    </div>
  );
}
