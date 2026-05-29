'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, PlayCircle, CheckCircle2, XCircle, BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardWarm } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';

const statusBadge: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'accent'> = {
  draft: 'muted',
  open: 'success',
  closed: 'info',
  cancelled: 'destructive',
};

export default function AdminVoteDetail() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [v, setV] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.all([
      api.get<any>(`/votes/${id}`).then((r) => setV(r.data)),
      api.get<any>(`/votes/${id}/results`).then((r) => setResults(r.data)).catch(() => setResults(null)),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const act = async (path: string, title: string) => {
    const ok = await confirm({ title, confirmText: 'Proceed' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/votes/${id}${path}`);
      toast({ variant: 'success', title: 'Done' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!v) return <Card><CardContent className="p-10 text-center"><p className="text-body text-muted-foreground">Vote not found.</p></CardContent></Card>;

  const options = (v.options as any[]) || [];

  return (
    <div className="space-y-6">
      <Link href="/votes" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Votes
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusBadge[v.status] || 'secondary'}>{v.status}</Badge>
            {v.type !== 'standard' && <Badge variant="accent">{v.type.replace('_', ' ')}</Badge>}
            {v.anonymous && <Badge variant="muted">anonymous</Badge>}
            {v.outcome && <Badge variant={v.outcome === 'passed' ? 'success' : 'destructive'}>{v.outcome.replace('_', ' ')}</Badge>}
          </div>
          <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">{v.title}</h1>
          <p className="mt-1 text-caption text-muted-foreground">Opens {formatDate(v.opensAt)} → Closes {formatDate(v.closesAt)}</p>
        </div>
        <div className="flex gap-2">
          {v.status === 'draft' && v.type === 'special_resolution' && !v.secondedBy && (
            <Button variant="secondary" onClick={() => act('/second', 'Second this motion?')} disabled={busy}>Second</Button>
          )}
          {v.status === 'draft' && (
            <Button onClick={() => act('/open', `Open ${v.title}?`)} disabled={busy}>
              <PlayCircle className="mr-1.5 h-4 w-4" />Open voting
            </Button>
          )}
          {v.status === 'open' && (
            <Button variant="secondary" onClick={() => act('/close', `Close vote and tally results?`)} disabled={busy}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />Close
            </Button>
          )}
          {(v.status === 'draft' || v.status === 'open') && (
            <Button variant="secondary" onClick={() => act('/cancel', `Cancel ${v.title}?`)} disabled={busy}>
              <XCircle className="mr-1.5 h-4 w-4" />Cancel
            </Button>
          )}
        </div>
      </header>

      <Card><CardContent className="p-6 space-y-3">
        <p className="text-body text-graphite whitespace-pre-wrap">{v.description}</p>
        <div className="grid gap-3 sm:grid-cols-4 pt-2 text-caption">
          <div><p className="text-muted-foreground uppercase tracking-wider">Quorum</p><p className="text-graphite font-medium">{v.quorumPercent}%</p></div>
          <div><p className="text-muted-foreground uppercase tracking-wider">Pass threshold</p><p className="text-graphite font-medium">{v.passThresholdPercent}%</p></div>
          <div><p className="text-muted-foreground uppercase tracking-wider">Eligible</p><p className="text-graphite font-medium">{v.eligibleCountSnapshot ?? '—'}</p></div>
          <div><p className="text-muted-foreground uppercase tracking-wider">Ballots</p><p className="text-graphite font-medium">{v._count?.ballots ?? 0}</p></div>
        </div>
      </CardContent></Card>

      {results && (
        <Card><CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Results</h3>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          {results.ballotCount === 0 ? (
            <p className="text-caption text-muted-foreground">No ballots cast yet.</p>
          ) : (
            <div className="space-y-3">
              {results.options.map((o: any) => (
                <div key={o.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-graphite">{o.label}</span>
                    <span className="text-muted-foreground">{o.count} ({o.pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-surface overflow-hidden">
                    <div className="h-full bg-ember-orange transition-all" style={{ width: `${o.pct}%` }} />
                  </div>
                </div>
              ))}
              <CardWarm className="mt-3 p-3 text-caption text-graphite">
                Quorum {results.quorumMet ? <Badge variant="success">met</Badge> : <Badge variant="warning">not met</Badge>}
                {' · '}Pass threshold {results.passThresholdPercent}% of cast.
              </CardWarm>
            </div>
          )}
        </CardContent></Card>
      )}

      <Card><CardContent className="p-6">
        <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3">Options</h3>
        <ul className="space-y-1.5">
          {options.map((o: any) => (
            <li key={o.id} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-caption text-muted-foreground w-16 shrink-0">{o.id}</span>
              <span className="text-graphite">{o.label}</span>
            </li>
          ))}
        </ul>
      </CardContent></Card>
    </div>
  );
}
