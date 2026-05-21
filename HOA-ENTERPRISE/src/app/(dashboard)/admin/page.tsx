'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2, Users, FileText, CreditCard, AlertTriangle, Wallet,
  ArrowUpRight, Plus, Megaphone, ShieldAlert, Vote, KeyRound, Receipt,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ranges = [
  { id: 'day', label: '24h' },
  { id: 'week', label: '7d' },
  { id: 'month', label: '30d' },
  { id: 'quarter', label: '90d' },
  { id: 'year', label: '1y' },
] as const;

type RangeId = typeof ranges[number]['id'];

export default function AdminDashboard() {
  const { user, organizationName } = useAuth();
  const [range, setRange] = useState<RangeId>('month');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // Force the admin persona — without this, if a user with multiple roles
    // (e.g. exco_member + tenant) had their last switch flip them to a
    // non-admin role and they navigated to /admin, the API would return a
    // different persona's payload (board / resident / etc.) and this page
    // would crash dereferencing `data.activity.recentPayments`. The
    // controller validates that only admin roles may use this override.
    api
      .get<any>(`/dashboard?range=${range}&persona=admin`)
      .then((r) => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [range]);

  // Defensive shorthands — if the API ever returns a payload missing one
  // of these, we render empty states instead of throwing.
  const stats = data?.stats ?? {};
  const recentInvoices: any[] = data?.activity?.recentInvoices ?? [];
  const recentPayments: any[] = data?.activity?.recentPayments ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-caption uppercase tracking-[0.16em] text-muted-foreground">{organizationName}</p>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ''}.
          </h1>
          <p className="mt-1 text-body text-muted-foreground max-w-lg">Here's how your community is doing.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/finance/invoices/new"><Button><Plus className="mr-1.5 h-4 w-4" />New invoice</Button></Link>
          <Link href="/communications"><Button variant="secondary"><Megaphone className="mr-1.5 h-4 w-4" />Broadcast</Button></Link>
        </div>
      </header>

      <div className="inline-flex rounded-pill bg-stone-surface p-1">
        {ranges.map((r) => (
          <button key={r.id} onClick={() => setRange(r.id)}
            className={cn('rounded-pill px-3 py-1 text-sm font-medium transition-colors',
              range === r.id ? 'bg-card text-charcoal-primary shadow-inset-stone' : 'text-muted-foreground hover:text-graphite')}>
            {r.label}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-caption font-semibold uppercase tracking-[0.12em] text-muted-foreground">Finance</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard title="Collected" value={formatCurrency(stats.collectedInRange ?? 0)} description={`${stats.paymentsInRange ?? 0} payments in range`} icon={Wallet} accent="meadow" />
              <StatCard title="Outstanding (all-time)" value={formatCurrency(stats.outstandingAllTime ?? 0)} icon={AlertTriangle} accent="ember" />
              <StatCard title="Overdue" value={stats.invoicesOverdue ?? 0} description="Past due" icon={FileText} accent="sunburst" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-caption font-semibold uppercase tracking-[0.12em] text-muted-foreground">Operations</h2>
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard title="Open violations" value={stats.openViolations ?? 0} icon={ShieldAlert} accent="ember" />
              <StatCard title="Open votes" value={stats.openVotes ?? 0} icon={Vote} accent="midnight" />
              <StatCard title="Pending approvals" value={stats.pendingApprovals ?? 0} icon={Receipt} accent="sunburst" />
              <StatCard title="Gate passes today" value={stats.gatePassesToday ?? 0} icon={KeyRound} accent="sky" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-caption font-semibold uppercase tracking-[0.12em] text-muted-foreground">Community</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard title="Estates" value={stats.estates ?? 0} icon={Building2} accent="midnight" />
              <StatCard title="Units" value={stats.units ?? 0} icon={Users} accent="sky" />
              <StatCard title="Active occupancies" value={stats.activeOccupancies ?? 0} icon={Users} accent="meadow" />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Card><CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Recent invoices</h3>
                <Link href="/finance/invoices" className="text-caption text-ember-orange hover:underline">All →</Link>
              </div>
              {recentInvoices.length === 0 ? (
                <p className="text-caption text-muted-foreground">No invoices yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentInvoices.map((i: any) => (
                    <Link key={i.id} href={`/finance/invoices/${i.id}`} className="flex items-center justify-between rounded-lg p-2.5 -mx-2.5 hover:bg-stone-surface transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm text-graphite font-medium truncate">{i.invoiceNumber}</p>
                        <p className="text-caption text-muted-foreground">Unit {i.unitNumber} · {formatDate(i.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm tabular-nums text-graphite">{formatCurrency(i.amount)}</p>
                        <Badge variant={statusVariant(i.status)}>{i.status}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent></Card>

            <Card><CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Recent payments</h3>
                <Link href="/finance/payments" className="text-caption text-ember-orange hover:underline">All →</Link>
              </div>
              {recentPayments.length === 0 ? (
                <p className="text-caption text-muted-foreground">No payments yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentPayments.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg p-2.5 -mx-2.5 hover:bg-stone-surface transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm text-graphite font-medium truncate">{p.invoiceNumber}</p>
                        <p className="text-caption text-muted-foreground">Unit {p.unitNumber} · {p.method} · {formatDate(p.at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm tabular-nums text-meadow-green">{formatCurrency(p.amount)}</p>
                        <Badge variant={p.status === 'completed' ? 'success' : 'muted'}>{p.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>
          </section>
        </>
      )}
    </div>
  );
}

function statusVariant(s: string): 'success' | 'destructive' | 'muted' | 'info' | 'warning' {
  switch (s) {
    case 'paid': return 'success';
    case 'overdue': return 'destructive';
    case 'partial': return 'warning';
    case 'sent': return 'info';
    default: return 'muted';
  }
}
