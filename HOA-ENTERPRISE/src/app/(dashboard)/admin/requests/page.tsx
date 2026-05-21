'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox, AlertTriangle, Filter, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type RequestRow = {
  id: string;
  subject: string;
  status: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: { id: string; name: string; slaResolveHours: number | null };
  unit: { id: string; unitNumber: string; estate: { name: string } } | null;
  assignedToUserId: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUSES = ['all', 'submitted', 'triaged', 'in_progress', 'waiting_resident', 'resolved', 'closed', 'cancelled'] as const;

const priorityBadge: Record<string, 'destructive' | 'warning' | 'info' | 'muted'> = {
  urgent: 'destructive', high: 'warning', normal: 'info', low: 'muted',
};

const statusBadge: Record<string, 'default' | 'info' | 'warning' | 'success' | 'muted' | 'destructive'> = {
  submitted: 'info',
  triaged: 'info',
  in_progress: 'warning',
  waiting_resident: 'warning',
  resolved: 'success',
  closed: 'muted',
  cancelled: 'destructive',
};

export default function AdminRequestsPage() {
  const [items, setItems] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<typeof STATUSES[number]>('submitted');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [summary, setSummary] = useState<{ openCount: number; overdueCount: number; byPriority: Record<string, number> } | null>(null);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (status && status !== 'all') qs.set('status', status);
    if (overdueOnly) qs.set('overdue', 'true');
    Promise.all([
      api.get<any>(`/requests?${qs.toString()}`).then((r) => setItems(r.data || [])),
      api.get<any>('/requests/analytics/overdue').then((r) => setSummary(r.data)).catch(() => setSummary(null)),
    ]).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, overdueOnly]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Resident requests</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Triage queue: maintenance, access, parking, complaints, anything routed to the management team.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Open" value={summary?.openCount ?? 0} icon={Inbox} tone="default" />
        <StatCard label="Overdue" value={summary?.overdueCount ?? 0} icon={AlertTriangle} tone="destructive" />
        <StatCard label="Urgent open" value={summary?.byPriority?.urgent ?? 0} icon={Clock} tone="warning" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'rounded-pill px-3 py-1 text-caption font-medium transition-colors capitalize',
              status === s ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone',
            )}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
        <button
          onClick={() => setOverdueOnly(!overdueOnly)}
          className={cn(
            'rounded-pill px-3 py-1 text-caption font-medium transition-colors',
            overdueOnly ? 'bg-coral-red text-white' : 'bg-stone-surface text-graphite hover:bg-card',
          )}
        >
          Overdue only
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-meadow-green/15 text-meadow-green">
                <Inbox className="h-5 w-5" />
              </div>
              <p className="mt-3 text-body text-charcoal-primary font-medium">No {status === 'all' ? '' : status.replace(/_/g, ' ')} requests</p>
              <p className="text-caption text-muted-foreground">Residents can submit one from the PWA.</p>
            </div>
          ) : (
            <ul className="divide-y divide-stone-surface">
              {items.map((r) => {
                const overdue = r.dueAt && new Date(r.dueAt) < new Date() && !['resolved', 'closed', 'cancelled'].includes(r.status);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/admin/requests/${r.id}`}
                      className="flex items-start gap-3 p-4 hover:bg-stone-surface/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-charcoal-primary truncate">{r.subject}</span>
                          <Badge variant={priorityBadge[r.priority] || 'muted'}>{r.priority}</Badge>
                          <Badge variant={statusBadge[r.status] || 'muted'}>{r.status.replace(/_/g, ' ')}</Badge>
                          {overdue && <Badge variant="destructive">overdue</Badge>}
                        </div>
                        <p className="mt-1 text-caption text-muted-foreground">
                          {r.category.name}
                          {r.unit && ` · ${r.unit.estate.name} #${r.unit.unitNumber}`}
                          {` · filed ${formatDate(r.createdAt)}`}
                          {r.dueAt && ` · due ${formatDate(r.dueAt)}`}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: 'default' | 'warning' | 'destructive' }) {
  const toneClass = tone === 'destructive' ? 'text-coral-red bg-coral-red/10'
    : tone === 'warning' ? 'text-deep-amber bg-deep-amber/10'
    : 'text-graphite bg-stone-surface';
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-caption text-muted-foreground">{label}</p>
          <p className="text-heading-sm font-display font-medium text-charcoal-primary tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
