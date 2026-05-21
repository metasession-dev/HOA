'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Activity, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';

const statusBadgeMap: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  active: 'success',
  used: 'muted',
  revoked: 'destructive',
  expired: 'warning',
};

const logTypeColor: Record<string, string> = {
  entry: 'text-meadow-green',
  exit: 'text-graphite',
  override_entry: 'text-deep-amber',
  denied: 'text-coral-red',
};

const logTypeLabel: Record<string, string> = {
  entry: 'Entry',
  exit: 'Exit',
  override_entry: 'Override entry',
  denied: 'Denied',
};

export default function AdminPassesPage() {
  const [passes, setPasses] = useState<any[]>([]);
  const [today, setToday] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<any>('/passes?limit=100').then((r) => setPasses(r.data || [])),
      api.get<any>('/visitor-logs/today').then((r) => setToday(r.data)).catch(() => setToday(null)),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
          Gate passes
        </h1>
        <p className="mt-1 text-body text-muted-foreground">
          Visitor register and active passes across your community.
        </p>
      </header>

      {/* Today's activity summary */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Entries today"
          value={loading ? '—' : today?.counts?.entries ?? 0}
          icon={LogIn}
          iconClass="text-meadow-green bg-meadow-green/10"
        />
        <StatCard
          label="Exits today"
          value={loading ? '—' : today?.counts?.exits ?? 0}
          icon={LogOut}
          iconClass="text-graphite bg-stone-surface"
        />
        <StatCard
          label="Overrides"
          value={loading ? '—' : today?.counts?.overrides ?? 0}
          icon={ShieldAlert}
          iconClass="text-deep-amber bg-deep-amber/10"
        />
        <StatCard
          label="Active passes"
          value={loading ? '—' : passes.filter((p) => p.status === 'active').length}
          icon={KeyRound}
          iconClass="text-[color:var(--c-brand-green)] bg-[color:var(--c-brand-green-light)]/15"
        />
      </section>

      {/* Today's live log */}
      {today?.logs && today.logs.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">
                Today&rsquo;s activity
              </h3>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <ul className="mt-3 divide-y divide-stone-surface">
              {today.logs.slice(0, 10).map((log: any) => (
                <li key={log.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={cn('text-caption font-medium uppercase tracking-wider', logTypeColor[log.type])}>
                      {logTypeLabel[log.type] || log.type}
                    </span>
                    <span className="text-sm text-charcoal-primary">
                      {log.gatePass?.visitorName}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      Unit {log.gatePass?.unit?.unitNumber}
                    </span>
                  </div>
                  <span className="text-caption text-muted-foreground">
                    {new Date(log.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* All passes table */}
      {loading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
          </CardContent>
        </Card>
      ) : passes.length === 0 ? (
        <EmptyState
          variant="card"
          icon={KeyRound}
          title="No passes yet"
          description="When residents pre-book visitors or contractors, you'll see every active pass and live gate activity here."
          action={{ label: 'Open gate console', href: '/gate' }}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Visitor</th>
                    <th className="px-6 py-3">Unit</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Valid until</th>
                    <th className="px-6 py-3">Uses</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {passes.map((p: any, idx: number) => (
                    <tr
                      key={p.id}
                      className={cn(
                        'group transition-colors hover:bg-stone-surface/50',
                        idx !== passes.length - 1 && 'border-b border-stone-surface',
                      )}
                    >
                      <td className="px-6 py-4 font-mono text-[13px] text-charcoal-primary">
                        <Link href={`/passes/${p.id}`} className="hover:underline">
                          {p.code.slice(0, 4)}-{p.code.slice(4)}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-graphite">{p.visitorName}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        Unit {p.unit?.unitNumber} · {p.unit?.estate?.name}
                      </td>
                      <td className="px-6 py-4 capitalize text-muted-foreground">{p.type.replace('_', ' ')}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(p.validUntil)}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {p.usesCount} / {p.maxUses}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={statusBadgeMap[p.status] || 'secondary'}>{p.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
