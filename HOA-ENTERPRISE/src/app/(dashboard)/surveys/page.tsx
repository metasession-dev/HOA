'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const statusBadge: Record<string, 'muted' | 'success' | 'info'> = { draft: 'muted', open: 'success', closed: 'info' };

export default function SurveysListPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/surveys').then((r) => setItems(r.data || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Surveys</h1>
          <p className="mt-1 text-body text-muted-foreground">Gather feedback from residents and stakeholders.</p>
        </div>
        <Link href="/surveys/new"><Button><Plus className="mr-1.5 h-4 w-4" />New survey</Button></Link>
      </header>

      {loading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-10 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
            <ClipboardList className="h-5 w-5 text-graphite" />
          </div>
          <p className="mt-3 text-body text-charcoal-primary font-medium">No surveys yet</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <Link key={s.id} href={`/surveys/${s.id}`} className="block group">
              <Card className="transition-shadow hover:shadow-soft"><CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={statusBadge[s.status] || 'muted'}>{s.status}</Badge>
                  {s.anonymous && <Badge variant="muted">anonymous</Badge>}
                </div>
                <p className="text-heading-sm font-medium text-charcoal-primary">{s.title}</p>
                <p className="text-caption text-muted-foreground line-clamp-1">{s.description}</p>
                <p className="text-caption text-muted-foreground mt-1">
                  {(s.questions as any[]).length} questions · {s._count?.responses || 0} responses
                  {s.closesAt && ` · Closes ${formatDate(s.closesAt)}`}
                </p>
              </CardContent></Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
