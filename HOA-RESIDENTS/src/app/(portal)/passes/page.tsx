'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Plus, Calendar, Car, User2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const statusBadgeMap: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary' | 'accent'> = {
  active: 'success',
  used: 'muted',
  revoked: 'destructive',
  expired: 'warning',
};

const typeLabel: Record<string, string> = {
  single_visit: 'Single visit',
  recurring: 'Recurring',
  event: 'Event',
  contractor: 'Contractor',
  delivery: 'Delivery',
  emergency: 'Emergency',
};

const tabs = [
  { id: 'active', label: 'Active' },
  { id: 'history', label: 'History' },
] as const;

export default function MyPassesPage() {
  const [passes, setPasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'history'>('active');

  useEffect(() => {
    api
      .get<any>('/passes?limit=100')
      .then((res) => setPasses(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = passes.filter((p) =>
    tab === 'active' ? p.status === 'active' : p.status !== 'active',
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Gate passes</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Create and manage visitor passes for your unit.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-pill bg-stone-surface p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-pill px-4 py-1.5 text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'bg-card text-charcoal-primary shadow-inset-stone'
                    : 'text-muted-foreground hover:text-graphite',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Link href="/passes/new">
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              New pass
            </Button>
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
              <KeyRound className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">
              {tab === 'active' ? 'No active passes' : 'No past passes'}
            </p>
            {tab === 'active' && (
              <>
                <p className="text-caption text-muted-foreground">
                  Create your first pass to share with a visitor.
                </p>
                <Link href="/passes/new" className="mt-4 inline-block">
                  <Button>
                    <Plus className="mr-1.5 h-4 w-4" />
                    New pass
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p: any) => (
            <Link key={p.id} href={`/passes/${p.id}`} className="block group">
              <Card className="transition-shadow duration-200 hover:shadow-soft">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-icon bg-ember-orange/15 text-ember-orange">
                      <KeyRound className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-heading-sm font-medium text-charcoal-primary truncate">
                        {p.visitorName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <User2 className="h-3 w-3" />
                          {typeLabel[p.type] || p.type}
                        </span>
                        {p.vehicleReg && (
                          <span className="inline-flex items-center gap-1">
                            <Car className="h-3 w-3" />
                            {p.vehicleReg}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(p.validFrom)} → {formatDate(p.validUntil)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={statusBadgeMap[p.status] || 'secondary'}>{p.status}</Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {p.code.slice(0, 4)}-{p.code.slice(4)}
                    </span>
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
