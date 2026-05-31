'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Gavel, Vote as VoteIcon, Star, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';

const tenderBadge: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'muted', open: 'info', evaluating: 'warning', awarded: 'success', cancelled: 'secondary',
};
const bidBadge: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  submitted: 'info', shortlisted: 'warning', awarded: 'success', rejected: 'destructive', withdrawn: 'secondary',
};

export default function ContractDetailPage() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [t, setT] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<any>(`/tenders/${id}`).then((r) => setT(r.data)).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const act = async (fn: () => Promise<any>, successMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ variant: 'success', title: successMsg });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Action failed', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!t) return <Card><CardContent className="p-10 text-center"><p>Not found.</p></CardContent></Card>;

  const bids: any[] = t.bids || [];
  const canManageBids = t.status === 'open' || t.status === 'evaluating';

  const award = async (bidId: string, vendorName: string) => {
    const ok = await confirm({
      title: `Award to ${vendorName}?`,
      description: 'This finalises the tender, marks the other bids as not selected, and notifies all bidders.',
      confirmText: 'Award contract',
    });
    if (!ok) return;
    act(() => api.post(`/tenders/${id}/award`, { bidId }), 'Contract awarded');
  };

  return (
    <div className="space-y-6">
      <Link href="/contracts" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Contracts
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant={tenderBadge[t.status] || 'muted'}>{t.status}</Badge>
          <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">{t.title}</h1>
          <p className="mt-1 text-body text-muted-foreground">
            {t.category ? `${t.category} · ` : ''}Closes {formatDate(t.closesAt)}
            {(t.budgetMin != null || t.budgetMax != null) && (
              <> · Budget {t.budgetMin != null ? formatCurrency(Number(t.budgetMin), t.currency) : '…'}–{t.budgetMax != null ? formatCurrency(Number(t.budgetMax), t.currency) : '…'}</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.status === 'draft' && (
            <Link href={`/contracts/${id}/edit`}>
              <Button variant="secondary" disabled={busy}>Edit</Button>
            </Link>
          )}
          {t.status === 'draft' && (
            <Button disabled={busy} onClick={() => act(() => api.post(`/tenders/${id}/open`), 'Tender opened for bids')}>
              <Gavel className="mr-1.5 h-3.5 w-3.5" />Open for bids
            </Button>
          )}
          {t.status === 'open' && (
            <Button disabled={busy} onClick={() => act(() => api.post(`/tenders/${id}/close`), 'Bidding closed')}>Close bidding</Button>
          )}
          {t.status === 'evaluating' && !t.voteId && (
            <Button disabled={busy || bids.length === 0} onClick={() => act(() => api.post(`/tenders/${id}/exco-vote`, {}), 'Exco vote started')}>
              <VoteIcon className="mr-1.5 h-3.5 w-3.5" />Start Exco vote
            </Button>
          )}
          {!['awarded', 'cancelled'].includes(t.status) && (
            <Button variant="destructive" disabled={busy}
              onClick={async () => { const ok = await confirm({ title: 'Cancel tender?', description: 'This closes the tender without an award.', confirmText: 'Cancel tender', destructive: true }); if (ok) act(() => api.post(`/tenders/${id}/cancel`), 'Tender cancelled'); }}>
              Cancel
            </Button>
          )}
        </div>
      </header>

      <Card><CardContent className="space-y-3 p-6">
        <p className="whitespace-pre-wrap text-sm text-graphite">{t.description}</p>
        {t.scopeOfWork && (
          <div className="border-t border-stone-surface pt-3">
            <p className="text-caption uppercase tracking-wider text-muted-foreground mb-1">Scope of work</p>
            <p className="whitespace-pre-wrap text-sm text-graphite">{t.scopeOfWork}</p>
          </div>
        )}
        {Array.isArray(t.attachments) && t.attachments.length > 0 && (
          <div className="border-t border-stone-surface pt-3">
            <p className="text-caption uppercase tracking-wider text-muted-foreground mb-1">Documents</p>
            <ul className="space-y-1">
              {t.attachments.map((a: any, i: number) => (
                <li key={i}><a href={a.url?.startsWith('http') ? a.url : `${process.env.NEXT_PUBLIC_API_URL}${a.url}`} target="_blank" rel="noopener noreferrer" className="text-ember-orange hover:underline">{a.filename}</a></li>
              ))}
            </ul>
          </div>
        )}
      </CardContent></Card>

      {t.voteId && (
        <Card><CardContent className="flex items-center justify-between p-6">
          <div className="flex items-center gap-2">
            <VoteIcon className="h-4 w-4 text-graphite" />
            <div>
              <p className="text-body font-medium text-charcoal-primary">Exco award vote</p>
              <p className="text-caption text-muted-foreground">Status: {t.vote?.status || 'open'}{t.vote?.outcome ? ` · ${t.vote.outcome}` : ''}</p>
            </div>
          </div>
          <Link href={`/votes/${t.voteId}`} className="text-caption text-ember-orange hover:underline">View results →</Link>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-6">
        <h3 className="mb-3 text-heading-sm font-display font-medium text-charcoal-primary">Bids ({bids.length})</h3>
        {bids.length === 0 ? (
          <p className="py-4 text-caption text-muted-foreground">No bids yet.</p>
        ) : (
          <div className="space-y-3">
            {bids.map((b: any) => (
              <div key={b.id} className="rounded-lg bg-stone-surface/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-graphite">
                      {b.status === 'awarded' && <Trophy className="h-4 w-4 text-success" />}
                      {b.vendor?.name}
                      {b.vendor?.rating ? <span className="text-caption text-muted-foreground">· {b.vendor.rating}/5</span> : null}
                    </p>
                    <p className="text-caption text-muted-foreground">{formatDate(b.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium tabular-nums text-charcoal-primary">{formatCurrency(Number(b.amount), b.currency)}</p>
                    <Badge variant={bidBadge[b.status] || 'muted'}>{b.status}</Badge>
                    {t.status === 'evaluating' && b.status !== 'awarded' && (
                      <>
                        <Button size="sm" variant="ghost" disabled={busy}
                          onClick={() => act(() => api.post(`/tenders/${id}/shortlist`, { bidId: b.id, shortlisted: b.status !== 'shortlisted' }), b.status === 'shortlisted' ? 'Removed from shortlist' : 'Shortlisted')}>
                          <Star className={cn('mr-1 h-3.5 w-3.5', b.status === 'shortlisted' && 'fill-ember-orange text-ember-orange')} />
                          {b.status === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => award(b.id, b.vendor?.name || 'this vendor')}>Award</Button>
                      </>
                    )}
                  </div>
                </div>
                {b.proposal && <p className="mt-2 whitespace-pre-wrap border-t border-stone-surface pt-2 text-sm text-graphite">{b.proposal}</p>}
                {Array.isArray(b.attachments) && b.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {b.attachments.map((a: any, i: number) => (
                      <a key={i} href={a.url?.startsWith('http') ? a.url : `${process.env.NEXT_PUBLIC_API_URL}${a.url}`} target="_blank" rel="noopener noreferrer" className="text-caption text-ember-orange hover:underline">{a.filename}</a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
