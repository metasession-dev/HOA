'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Vote, Plus, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const statusBadge: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'accent'> = {
  draft: 'muted',
  open: 'success',
  closed: 'info',
  cancelled: 'destructive',
};

const filters = ['all', 'draft', 'open', 'closed'] as const;

export default function VotesListPage() {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<typeof filters[number]>('all');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const q = filter === 'all' ? '' : `?status=${filter}`;
    api.get<any>(`/votes${q}`).then((r) => setItems(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Votes &amp; motions</h1>
          <p className="mt-1 text-body text-muted-foreground">Board motions, AGM votes and special resolutions.</p>
        </div>
        <Link href="/votes/new"><Button><Plus className="mr-1.5 h-4 w-4" />New motion</Button></Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {filters.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={cn(
            'rounded-pill px-3 py-1 text-caption font-medium transition-colors capitalize',
            filter === s ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone',
          )}>{s}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-10 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface"><Vote className="h-5 w-5 text-graphite" /></div>
          <p className="mt-3 text-body text-charcoal-primary font-medium">No votes yet</p>
          <p className="text-caption text-muted-foreground">Create your first motion or AGM vote.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((v) => (
            <Link key={v.id} href={`/votes/${v.id}`} className="block group">
              <Card className="transition-shadow hover:shadow-soft">
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={statusBadge[v.status] || 'secondary'}>{v.status}</Badge>
                      {v.type !== 'standard' && <Badge variant="accent">{v.type.replace('_', ' ')}</Badge>}
                      {v.anonymous && <Badge variant="muted">anonymous</Badge>}
                    </div>
                    <p className="mt-1 text-heading-sm font-medium text-charcoal-primary truncate">{v.title}</p>
                    <p className="mt-0.5 text-caption text-muted-foreground line-clamp-1">{v.description}</p>
                    <p className="mt-1 text-caption text-muted-foreground">
                      Opens {formatDate(v.opensAt)} → Closes {formatDate(v.closesAt)} · {v._count?.ballots || 0} ballots cast
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
