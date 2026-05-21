'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Vote } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const statusBadge: Record<string, 'muted' | 'info' | 'success' | 'destructive'> = {
  open: 'success', closed: 'info', cancelled: 'destructive',
};

export default function ResidentVotesList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/votes').then((r) => setItems(r.data || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const open = items.filter((v) => v.status === 'open');
  const past = items.filter((v) => v.status !== 'open');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Votes</h1>
        <p className="mt-1 text-body text-muted-foreground">Cast your ballot on community decisions.</p>
      </header>

      {loading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-10 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface"><Vote className="h-5 w-5 text-graphite" /></div>
          <p className="mt-3 text-body text-charcoal-primary font-medium">No active votes</p>
          <p className="text-caption text-muted-foreground">You'll be notified when a motion opens.</p>
        </CardContent></Card>
      ) : (
        <>
          {open.length > 0 && (
            <section>
              <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">Open now ({open.length})</h2>
              <div className="space-y-3">
                {open.map((v) => (
                  <Link key={v.id} href={`/votes/${v.id}`} className="block group">
                    <Card className="transition-shadow hover:shadow-soft"><CardContent className="p-5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="success">open</Badge>
                        {v.type !== 'standard' && <Badge variant="accent">{v.type.replace('_', ' ')}</Badge>}
                      </div>
                      <p className="mt-1 text-heading-sm font-medium text-charcoal-primary">{v.title}</p>
                      <p className="mt-0.5 text-caption text-muted-foreground line-clamp-2">{v.description}</p>
                      <p className="mt-1 text-caption text-muted-foreground">Closes {formatDate(v.closesAt)}</p>
                    </CardContent></Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">Past votes</h2>
              <div className="space-y-2">
                {past.map((v) => (
                  <Link key={v.id} href={`/votes/${v.id}`} className="block">
                    <Card><CardContent className="flex items-center justify-between p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-charcoal-primary truncate">{v.title}</p>
                        <p className="text-caption text-muted-foreground">Closed {formatDate(v.closedAt || v.closesAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {v.outcome && <Badge variant={v.outcome === 'passed' ? 'success' : 'destructive'}>{v.outcome.replace('_', ' ')}</Badge>}
                        <Badge variant={statusBadge[v.status] || 'muted'}>{v.status}</Badge>
                      </div>
                    </CardContent></Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
