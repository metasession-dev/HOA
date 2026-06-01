'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useListControls, ListToolbar, ListPager } from '@/components/ui/list-controls';

export default function ResidentSurveysList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/surveys').then((r) => setItems(r.data || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const c = useListControls(items, {
    searchText: (s: any) => `${s.title ?? ''} ${s.description ?? ''} ${s.status ?? ''}`,
    date: (s: any) => s.closesAt ?? s.createdAt,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Surveys</h1>
        <p className="mt-1 text-body text-muted-foreground">Share your feedback with the HOA.</p>
      </header>

      {!loading && items.length > 0 && <ListToolbar c={c} searchPlaceholder="Search surveys" />}

      {loading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-10 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface"><ClipboardList className="h-5 w-5 text-graphite" /></div>
          <p className="mt-3 text-body text-charcoal-primary font-medium">No surveys</p>
        </CardContent></Card>
      ) : c.total === 0 ? (
        <Card><CardContent className="p-10 text-center text-caption text-muted-foreground">No surveys match your filters.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {c.pageItems.map((s: any) => (
            <Link key={s.id} href={`/surveys/${s.id}`} className="block">
              <Card className="transition-shadow hover:shadow-soft"><CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={s.status === 'open' ? 'success' : 'muted'}>{s.status}</Badge>
                  {s.anonymous && <Badge variant="muted">anonymous</Badge>}
                </div>
                <p className="text-heading-sm font-medium text-charcoal-primary">{s.title}</p>
                <p className="text-caption text-muted-foreground line-clamp-1">{s.description}</p>
                {s.closesAt && <p className="text-caption text-muted-foreground mt-1">Closes {formatDate(s.closesAt)}</p>}
              </CardContent></Card>
            </Link>
          ))}
          <ListPager c={c} />
        </div>
      )}
    </div>
  );
}
