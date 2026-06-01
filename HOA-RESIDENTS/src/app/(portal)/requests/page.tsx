'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox, Plus, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useListControls, ListToolbar, ListPager } from '@/components/ui/list-controls';

const statusBadge: Record<string, 'default' | 'info' | 'warning' | 'success' | 'muted' | 'destructive'> = {
  submitted: 'info', triaged: 'info', in_progress: 'warning',
  waiting_resident: 'warning', resolved: 'success', closed: 'muted', cancelled: 'destructive',
};

export default function MyRequestsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/requests').then((res) => setItems(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const c = useListControls(items, {
    searchText: (r: any) => `${r.subject ?? ''} ${r.category?.name ?? ''} ${r.status ?? ''}`,
    date: (r: any) => r.createdAt,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">My requests</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Maintenance, access, parking and other requests to management.
          </p>
        </div>
        <Link href="/requests/new">
          <Button><Plus className="mr-1.5 h-4 w-4" />New request</Button>
        </Link>
      </header>

      {!loading && items.length > 0 && <ListToolbar c={c} searchPlaceholder="Search requests" />}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface text-graphite">
                <Inbox className="h-5 w-5" />
              </div>
              <p className="mt-3 text-body text-charcoal-primary font-medium">No requests yet</p>
              <p className="text-caption text-muted-foreground">Submit one when something needs the management team&rsquo;s attention.</p>
            </div>
          ) : c.total === 0 ? (
            <div className="p-10 text-center text-caption text-muted-foreground">No requests match your filters.</div>
          ) : (
            <ul className="divide-y divide-stone-surface">
              {c.pageItems.map((r: any) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`} className="block p-4 hover:bg-stone-surface/50 transition-colors">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-charcoal-primary truncate">{r.subject}</span>
                      <Badge variant={statusBadge[r.status] || 'muted'}>{r.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="mt-1 text-caption text-muted-foreground">
                      {r.category?.name}
                      {` · filed ${formatDate(r.createdAt)}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {!loading && items.length > 0 && <ListPager c={c} />}
    </div>
  );
}
