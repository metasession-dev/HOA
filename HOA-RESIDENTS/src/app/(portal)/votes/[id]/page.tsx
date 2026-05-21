'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, CheckCircle2, ShieldAlert, BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardWarm } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';

const reasonLabel: Record<string, string> = {
  no_active_occupancy: 'You are not registered as occupying a unit',
  wrong_organization: 'Your account is not in this HOA',
  not_owner: 'Only owners may vote',
  has_arrears: 'You have outstanding levies — only paid-up owners may vote',
  tag_mismatch: 'Your unit does not match the eligibility tag',
  no_person_record: 'No person record linked to your account',
};

export default function ResidentVoteDetail() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [v, setV] = useState<any>(null);
  const [results, setResults] = useState<any | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<any>(`/votes/${id}`).then((r) => setV(r.data)),
      api.get<any>(`/votes/${id}/results`).then((r) => setResults(r.data)).catch(() => setResults(null)),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const toggleOption = (optId: string) => {
    if (!v) return;
    if (v.allowMultiple) {
      setSelected(selected.includes(optId) ? selected.filter((x) => x !== optId) : [...selected, optId]);
    } else {
      setSelected([optId]);
    }
  };

  const handleCast = async () => {
    if (selected.length === 0) {
      toast({ variant: 'error', title: 'Select an option' });
      return;
    }
    const ok = await confirm({
      title: 'Cast your ballot?',
      description: v.anonymous ? 'This is an anonymous vote and cannot be changed once cast.' : 'You will not be able to change your vote after casting.',
      confirmText: 'Cast ballot',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const idemp = `ballot-${id}-${Date.now()}`;
      await api.post(`/votes/${id}/ballots`, { selectedOptionIds: selected }, idemp);
      toast({ variant: 'success', title: 'Ballot cast' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Cast failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!v) return <Card><CardContent className="p-10 text-center"><p className="text-body text-muted-foreground">Not found.</p></CardContent></Card>;

  const options = (v.options as any[]) || [];
  const showResults = results && (v.status === 'closed' || v.resultsLiveVisible);
  const canCast = v.status === 'open' && !v.hasCast && v.isEligible?.eligible;

  return (
    <div className="space-y-6">
      <Link href="/votes" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Votes
      </Link>

      <header>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={v.status === 'open' ? 'success' : v.status === 'closed' ? 'info' : 'muted'}>{v.status}</Badge>
          {v.type !== 'standard' && <Badge variant="accent">{v.type.replace('_', ' ')}</Badge>}
          {v.anonymous && <Badge variant="muted">anonymous</Badge>}
          {v.outcome && <Badge variant={v.outcome === 'passed' ? 'success' : 'destructive'}>{v.outcome.replace('_', ' ')}</Badge>}
        </div>
        <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">{v.title}</h1>
        <p className="mt-1 text-caption text-muted-foreground">Closes {formatDate(v.closesAt)}</p>
      </header>

      <Card><CardContent className="p-6"><p className="text-body text-graphite whitespace-pre-wrap">{v.description}</p></CardContent></Card>

      {v.status === 'open' && !v.isEligible?.eligible && (
        <Card><CardContent className="p-5 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-coral-red shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-charcoal-primary">Not eligible to vote</p>
            <p className="text-caption text-muted-foreground">{reasonLabel[v.isEligible?.reason] || v.isEligible?.reason}</p>
          </div>
        </CardContent></Card>
      )}

      {v.status === 'open' && v.hasCast && (
        <Card><CardContent className="p-5 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-meadow-green shrink-0 mt-0.5" />
          <p className="text-sm text-graphite">You have already cast your ballot. Thanks for participating.</p>
        </CardContent></Card>
      )}

      {canCast && (
        <Card><CardContent className="space-y-3 p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Cast your ballot</h3>
          <p className="text-caption text-muted-foreground">{v.allowMultiple ? 'Select one or more.' : 'Select exactly one.'}</p>
          <div className="space-y-2">
            {options.map((o: any) => {
              const sel = selected.includes(o.id);
              return (
                <button key={o.id} type="button" onClick={() => toggleOption(o.id)}
                  className={cn(
                    'w-full rounded-lg px-4 py-3 text-left transition-colors',
                    sel ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone',
                  )}>
                  <span className="font-medium">{o.label}</span>
                </button>
              );
            })}
          </div>
          <Button onClick={handleCast} disabled={submitting || selected.length === 0} className="w-full">
            {submitting ? 'Submitting…' : 'Cast ballot'}
          </Button>
          {v.proxyAllowed && (
            <p className="text-caption text-muted-foreground">
              Need to delegate? <Link href={`/votes/${id}/proxy`} className="text-ember-orange hover:underline">Grant a proxy</Link>
            </p>
          )}
        </CardContent></Card>
      )}

      {showResults && (
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
                    <div className="h-full bg-ember-orange" style={{ width: `${o.pct}%` }} />
                  </div>
                </div>
              ))}
              <CardWarm className="mt-3 p-3 text-caption text-graphite">
                {results.ballotCount} ballots cast · Quorum {results.quorumMet ? 'met' : 'not met'}
              </CardWarm>
            </div>
          )}
        </CardContent></Card>
      )}
    </div>
  );
}
