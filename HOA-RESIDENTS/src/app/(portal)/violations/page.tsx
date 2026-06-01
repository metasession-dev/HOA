'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useListControls, ListToolbar, ListPager } from '@/components/ui/list-controls';

const statusBadge: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'accent'> = {
  open: 'warning',
  noticed: 'info',
  acknowledged: 'muted',
  appealing: 'accent',
  board_review: 'accent',
  upheld: 'destructive',
  dismissed: 'success',
  closed: 'muted',
};

export default function MyViolationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/violations').then((r) => setItems(r.data || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const c = useListControls(items, {
    searchText: (v: any) => `${v.category?.name ?? ''} ${v.description ?? ''} ${v.status ?? ''}`,
    date: (v: any) => v.occurredAt,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Violations</h1>
        <p className="mt-1 text-body text-muted-foreground">Notices issued to your unit. Tap to view or appeal.</p>
      </header>

      {!loading && items.length > 0 && <ListToolbar c={c} searchPlaceholder="Search violations" />}

      {loading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-meadow-green/15 text-meadow-green">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No violations on record</p>
            <p className="text-caption text-muted-foreground">Thanks for being a good neighbour.</p>
          </CardContent>
        </Card>
      ) : c.total === 0 ? (
        <Card><CardContent className="p-10 text-center text-caption text-muted-foreground">No violations match your filters.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {c.pageItems.map((v: any) => (
            <Link key={v.id} href={`/violations/${v.id}`} className="block group">
              <Card className="transition-shadow hover:shadow-soft">
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-caption uppercase tracking-wider text-muted-foreground">{v.category?.name}</p>
                    <p className="mt-0.5 text-heading-sm font-medium text-charcoal-primary line-clamp-1">{v.description}</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Occurred {formatDate(v.occurredAt)}
                    </p>
                  </div>
                  <Badge variant={statusBadge[v.status] || 'secondary'}>{v.status.replace('_', ' ')}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
          <ListPager c={c} />
        </div>
      )}
    </div>
  );
}
