'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function ViolationsAnalyticsPage() {
  const [byUnit, setByUnit] = useState<any[]>([]);
  const [byCategory, setByCategory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<any>('/violations/analytics/by-unit').then((r) => setByUnit(r.data || [])),
      api.get<any>('/violations/analytics/by-category').then((r) => setByCategory(r.data || [])),
    ]).finally(() => setLoading(false));
  }, []);

  const maxCategoryCount = Math.max(1, ...byCategory.map((c) => c.count));

  return (
    <div className="space-y-6">
      <Link href="/violations" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />
        Violations
      </Link>

      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Violations analytics</h1>
        <p className="mt-1 text-body text-muted-foreground">Trailing 12-month patterns.</p>
      </header>

      <section>
        <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">By unit (top 50, ≥3 = repeat offender)</h2>
        {loading ? (
          <Skeleton className="h-40" />
        ) : byUnit.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No violations in the last 12 months.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {byUnit.map((u) => (
                  <div
                    key={u.unitId}
                    className={cn(
                      'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
                      u.isRepeatOffender ? 'bg-coral-red/10' : 'bg-stone-surface',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-charcoal-primary">Unit {u.unit?.unitNumber}</p>
                      <p className="text-caption text-muted-foreground truncate">{u.unit?.estate?.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('font-display text-heading-sm font-medium', u.isRepeatOffender ? 'text-coral-red' : 'text-charcoal-primary')}>
                        {u.count}
                      </span>
                      {u.isRepeatOffender && <AlertTriangle className="h-3.5 w-3.5 text-coral-red" />}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">By category</h2>
        {loading ? (
          <Skeleton className="h-40" />
        ) : byCategory.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No categorised violations yet.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-6 space-y-3">
              {byCategory.map((c) => (
                <div key={c.categoryId}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-graphite">{c.category?.name}</span>
                    <Badge variant="muted">{c.count}</Badge>
                  </div>
                  <div className="h-2 rounded-full bg-stone-surface overflow-hidden">
                    <div
                      className="h-full bg-ember-orange transition-all"
                      style={{ width: `${(c.count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
