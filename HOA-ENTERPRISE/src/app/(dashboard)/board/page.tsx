'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Vote, Receipt, ShieldAlert, FileText, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export default function BoardDashboard() {
  const { user, organizationName } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Always ask for the board persona explicitly. Exco members get it because
  // it matches their role; admin / property-manager / super-admin get it via
  // the persona-override permission the controller grants their roles. This
  // lets an admin preview what the board sees for oversight without needing
  // an exco account. Non-admin non-board roles get a 403 from the server,
  // which surfaces as an error toast — they shouldn't be here anyway.
  useEffect(() => {
    api
      .get<any>('/dashboard?range=month&persona=board')
      .then((r) => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      </div>
    );
  }

  // Defensive: if the API didn't return board data (e.g. an unexpected role
  // somehow got here), surface a friendly fallback rather than rendering
  // garbage downstream.
  if (data.persona !== 'board') {
    return (
      <Card><CardContent className="p-10 text-center">
        <p className="text-body text-charcoal-primary font-medium">Board dashboard</p>
        <p className="mt-1 text-caption text-muted-foreground">This view is for exco members, the chairperson, and HOA admins.</p>
        <Link href="/admin" className="mt-3 inline-block text-ember-orange hover:underline">Go to admin home →</Link>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-caption uppercase tracking-[0.16em] text-muted-foreground">{organizationName}</p>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
          Board view{user?.firstName ? `, ${user.firstName}` : ''}.
        </h1>
        <p className="mt-1 text-body text-muted-foreground max-w-lg">Governance, approvals, and exception items needing your attention.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard title="Open votes" value={data.stats.openVotes} icon={Vote} accent="midnight" />
        <StatCard title="Mine to approve" value={data.stats.mineToApprove} icon={Receipt} accent="ember" />
        <StatCard title="Pending approvals" value={data.stats.pendingApprovals} icon={Receipt} accent="sunburst" />
        <StatCard title="Appeals for review" value={data.stats.appealsForReview} icon={ShieldAlert} accent="ember" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Awaiting your approval</h3>
            <Link href="/payables?mineToApprove=true" className="text-caption text-ember-orange hover:underline">All →</Link>
          </div>
          {data.activity.mineToApprove.length === 0 ? (
            <p className="text-caption text-muted-foreground">Nothing waiting on you.</p>
          ) : (
            <div className="space-y-2">
              {data.activity.mineToApprove.map((i: any) => (
                <Link key={i.id} href={`/payables/${i.id}`} className="flex items-center justify-between rounded-lg p-3 bg-stone-surface/50 hover:bg-stone-surface transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm text-graphite font-medium truncate">{i.vendorName}</p>
                    <p className="text-caption text-muted-foreground">{i.vendorInvoiceNo} · due {formatDate(i.dueDate)}</p>
                  </div>
                  <p className="text-sm tabular-nums text-charcoal-primary font-medium">{i.currency} {formatCurrency(i.amount)}</p>
                </Link>
              ))}
            </div>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Open votes</h3>
            <Link href="/votes" className="text-caption text-ember-orange hover:underline">All →</Link>
          </div>
          {data.activity.openVotes.length === 0 ? (
            <p className="text-caption text-muted-foreground">No open votes.</p>
          ) : (
            <div className="space-y-2">
              {data.activity.openVotes.map((v: any) => {
                const pct = v.eligibleCount > 0 ? Math.round((v.ballotsCast / v.eligibleCount) * 100) : 0;
                return (
                  <Link key={v.id} href={`/votes/${v.id}`} className="block rounded-lg p-3 bg-stone-surface/50 hover:bg-stone-surface transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm text-graphite font-medium truncate flex-1 mr-2">{v.title}</p>
                      <Badge variant="muted">{v.type.replace('_', ' ')}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-caption text-muted-foreground">
                      <span>Closes {formatDate(v.closesAt)}</span>
                      <span>{v.ballotsCast}/{v.eligibleCount ?? '?'} ballots ({pct}%)</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-card overflow-hidden">
                      <div className="h-full bg-ember-orange" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent></Card>
      </section>

      <Card><CardContent className="p-6">
        <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />Recent closed votes
        </h3>
        {data.activity.recentVotes.length === 0 ? (
          <p className="text-caption text-muted-foreground">No closures in range.</p>
        ) : (
          <div className="space-y-1">
            {data.activity.recentVotes.map((v: any) => (
              <Link key={v.id} href={`/votes/${v.id}`} className="flex items-center justify-between rounded-lg p-2.5 -mx-2.5 hover:bg-stone-surface transition-colors">
                <p className="text-sm text-graphite truncate">{v.title}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={v.outcome === 'passed' ? 'success' : v.outcome === 'failed' ? 'destructive' : 'muted'}>
                    {v.outcome?.replace('_', ' ') ?? '—'}
                  </Badge>
                  <span className="text-caption text-muted-foreground">{formatDate(v.closedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
