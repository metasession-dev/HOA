'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Gavel, Vote as VoteIcon, Star, Trophy, Paperclip, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadAttachment } from '@/lib/files';
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

function bidEventLabel(type: string): string {
  switch (type) {
    case 'submitted': return 'Bid submitted';
    case 'resubmitted': return 'Bid updated';
    case 'shortlisted': return 'Shortlisted';
    case 'unshortlisted': return 'Removed from shortlist';
    case 'awarded': return 'Awarded';
    case 'rejected': return 'Not selected';
    default: return type;
  }
}

/** Collapsible audit trail of a bid's changes (submit → resubmit → shortlist → award). */
function BidHistory({ events }: { events?: any[] }) {
  if (!events || events.length === 0) return null;
  return (
    <details className="mt-2 border-t border-stone-surface pt-2">
      <summary className="cursor-pointer text-caption text-muted-foreground hover:text-graphite">
        History ({events.length})
      </summary>
      <ul className="mt-2 space-y-1.5">
        {events.map((e: any) => (
          <li key={e.id} className="flex items-start gap-2 text-caption">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ember-orange/70" aria-hidden />
            <span className="text-graphite">
              <span className="font-medium text-charcoal-primary">{bidEventLabel(e.type)}</span>
              {e.payload?.oldAmount && e.payload?.newAmount && (
                <span className="text-muted-foreground"> · {e.payload.oldAmount} → {e.payload.newAmount}</span>
              )}
              <span className="text-muted-foreground"> · {formatDate(e.createdAt)}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function ContractDetailPage() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [t, setT] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Master/detail: which bid is open in the right-hand pane.
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get<any>(`/tenders/${id}`).then((r) => setT(r.data)).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // Keep a valid bid selected as data reloads (default to the first bid).
  useEffect(() => {
    const bs: any[] = t?.bids || [];
    setSelectedBidId((cur) => (cur && bs.some((b) => b.id === cur) ? cur : bs[0]?.id ?? null));
  }, [t]);

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

  // Confirm-then-act wrapper for the state-changing buttons (open / close / vote).
  const confirmAct = async (
    question: { title: string; description?: string; confirmText?: string; destructive?: boolean },
    fn: () => Promise<any>,
    successMsg: string,
  ) => {
    const ok = await confirm(question);
    if (ok) act(fn, successMsg);
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!t) return <Card><CardContent className="p-10 text-center"><p>Not found.</p></CardContent></Card>;

  const bids: any[] = t.bids || [];
  const selectedBid = bids.find((b) => b.id === selectedBidId) || null;
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
            <Button disabled={busy} onClick={() => confirmAct(
              { title: 'Open this tender for bids?', description: 'Vendors will be able to submit bids until the closing date.', confirmText: 'Open for bids' },
              () => api.post(`/tenders/${id}/open`), 'Tender opened for bids')}>
              <Gavel className="mr-1.5 h-3.5 w-3.5" />Open for bids
            </Button>
          )}
          {t.status === 'open' && (
            <Button disabled={busy} onClick={() => confirmAct(
              { title: 'Close bidding?', description: 'No further bids can be submitted after this. You can then evaluate and award.', confirmText: 'Close bidding' },
              () => api.post(`/tenders/${id}/close`), 'Bidding closed')}>Close bidding</Button>
          )}
          {t.status === 'evaluating' && !t.voteId && (
            <Button disabled={busy || bids.length === 0} onClick={() => confirmAct(
              { title: 'Start the Exco award vote?', description: 'This opens a committee vote to select the winning bid.', confirmText: 'Start vote' },
              () => api.post(`/tenders/${id}/exco-vote`, {}), 'Exco vote started')}>
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
                <li key={i}>
                  <button type="button" onClick={() => downloadAttachment(a)} className="inline-flex items-center gap-1.5 text-ember-orange hover:underline">
                    <Download className="h-3.5 w-3.5" />{a.filename}
                  </button>
                </li>
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

      <Card><CardContent className="p-0">
        <div className="p-6 pb-3">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Bids ({bids.length})</h3>
        </div>
        {bids.length === 0 ? (
          <p className="px-6 pb-6 text-caption text-muted-foreground">No bids yet.</p>
        ) : (
          /* Email-style master/detail: bid list on the left, full bid on the right. */
          <div className="flex flex-col border-t border-stone-surface lg:h-[32rem] lg:flex-row">
            <ul className={cn(
              'divide-y divide-stone-surface lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-stone-surface',
              selectedBid && 'hidden lg:block',
            )}>
              {bids.map((b: any) => {
                const active = b.id === selectedBidId;
                const hasAtts = Array.isArray(b.attachments) && b.attachments.length > 0;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedBidId(b.id)}
                      className={cn(
                        'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors',
                        active ? 'bg-sidebar-accent' : 'hover:bg-stone-surface/50',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {b.status === 'awarded' && <Trophy className="h-3.5 w-3.5 shrink-0 text-success" />}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-charcoal-primary">{b.vendor?.name}</span>
                        {hasAtts && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-caption tabular-nums text-muted-foreground">{formatCurrency(Number(b.amount), b.currency)}</span>
                        <Badge variant={bidBadge[b.status] || 'muted'}>{b.status}</Badge>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className={cn('min-w-0 flex-1 lg:overflow-y-auto', selectedBid ? 'block' : 'hidden lg:block')}>
              {!selectedBid ? (
                <div className="flex h-full items-center justify-center p-10 text-center text-caption text-muted-foreground">
                  Select a bid to view it.
                </div>
              ) : (
                <div className="p-6">
                  <button
                    type="button"
                    onClick={() => setSelectedBidId(null)}
                    className="mb-3 inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite lg:hidden"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />Back to bids
                  </button>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-body font-medium text-charcoal-primary">
                        {selectedBid.status === 'awarded' && <Trophy className="h-4 w-4 text-success" />}
                        {selectedBid.vendor?.name}
                        {selectedBid.vendor?.rating ? <span className="text-caption text-muted-foreground">· {selectedBid.vendor.rating}/5</span> : null}
                      </p>
                      <p className="text-caption text-muted-foreground">Submitted {formatDate(selectedBid.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-heading-sm font-medium tabular-nums text-charcoal-primary">{formatCurrency(Number(selectedBid.amount), selectedBid.currency)}</p>
                      <Badge variant={bidBadge[selectedBid.status] || 'muted'}>{selectedBid.status}</Badge>
                    </div>
                  </div>

                  {t.status === 'evaluating' && selectedBid.status !== 'awarded' && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={busy}
                        onClick={() => act(() => api.post(`/tenders/${id}/shortlist`, { bidId: selectedBid.id, shortlisted: selectedBid.status !== 'shortlisted' }), selectedBid.status === 'shortlisted' ? 'Removed from shortlist' : 'Shortlisted')}>
                        <Star className={cn('mr-1 h-3.5 w-3.5', selectedBid.status === 'shortlisted' && 'fill-ember-orange text-ember-orange')} />
                        {selectedBid.status === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
                      </Button>
                      <Button size="sm" disabled={busy} onClick={() => award(selectedBid.id, selectedBid.vendor?.name || 'this vendor')}>Award</Button>
                    </div>
                  )}

                  {selectedBid.proposal && (
                    <p className="mt-4 whitespace-pre-wrap border-t border-stone-surface pt-4 text-sm text-graphite">{selectedBid.proposal}</p>
                  )}

                  {Array.isArray(selectedBid.attachments) && selectedBid.attachments.length > 0 && (
                    <div className="mt-4 border-t border-stone-surface pt-4">
                      <p className="mb-2 text-caption uppercase tracking-wider text-muted-foreground">Attachments</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedBid.attachments.map((a: any, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => downloadAttachment(a)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-surface bg-card px-2.5 py-1.5 text-caption text-ember-orange hover:bg-stone-surface/50"
                          >
                            <Download className="h-3.5 w-3.5" />{a.filename}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <BidHistory events={selectedBid.events} />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
