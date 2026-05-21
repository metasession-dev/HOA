'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Send, DollarSign, CheckCircle2, XCircle, MessageSquare, Calendar, Building2, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardWarm } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';

const statusBadge: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'accent'> = {
  open: 'warning',
  noticed: 'info',
  acknowledged: 'muted',
  appealing: 'accent',
  board_review: 'accent',
  upheld: 'destructive',
  dismissed: 'success',
  closed: 'muted',
};

function newIdempKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ViolationDetailPage() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [v, setV] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fineOpen, setFineOpen] = useState(false);
  const [fineAmount, setFineAmount] = useState<string>('');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [appealOpen, setAppealOpen] = useState<any | null>(null);
  const [decision, setDecision] = useState<'upheld' | 'dismissed'>('dismissed');
  const [decisionNotes, setDecisionNotes] = useState('');

  const load = () => {
    api.get<any>(`/violations/${id}`).then((r) => setV(r.data)).catch((err) => toast({ variant: 'error', title: 'Load failed', description: err.message })).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handleNotice = async () => {
    const ok = await confirm({ title: 'Send notice to resident?', description: 'A formal notice is recorded and queued for delivery.', confirmText: 'Send notice' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/violations/${id}/notice`, {});
      toast({ variant: 'success', title: 'Notice sent' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Send failed', description: err.message });
    } finally { setBusy(false); }
  };

  const handleFine = async () => {
    if (!fineAmount && !v.category?.defaultFine) {
      toast({ variant: 'error', title: 'Fine amount required' });
      return;
    }
    setBusy(true);
    try {
      const body: any = {};
      if (fineAmount) body.amount = parseFloat(fineAmount);
      await api.post(`/violations/${id}/fine`, body, newIdempKey('fine'));
      toast({ variant: 'success', title: 'Fine invoice issued' });
      setFineOpen(false);
      setFineAmount('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Fine failed', description: err.message });
    } finally { setBusy(false); }
  };

  const handleResolve = async () => {
    if (!resolveNotes.trim()) {
      toast({ variant: 'error', title: 'Notes required' });
      return;
    }
    setBusy(true);
    try {
      await api.post(`/violations/${id}/resolve`, { notes: resolveNotes, outcome: 'closed' });
      toast({ variant: 'success', title: 'Violation closed' });
      setResolveOpen(false);
      setResolveNotes('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Close failed', description: err.message });
    } finally { setBusy(false); }
  };

  const handleDecide = async () => {
    if (!appealOpen) return;
    setBusy(true);
    try {
      await api.post(`/violations/appeals/${appealOpen.id}/decide`, { decision, notes: decisionNotes });
      toast({ variant: 'success', title: `Appeal ${decision}` });
      setAppealOpen(null);
      setDecisionNotes('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Decision failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!v) return <Card><CardContent className="p-10 text-center"><p className="text-body text-muted-foreground">Violation not found.</p></CardContent></Card>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/violations" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />
        Violations
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption uppercase tracking-wider text-muted-foreground">{v.category?.name}</p>
          <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">
            Unit {v.unit?.unitNumber}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-body text-muted-foreground">
            <Badge variant={statusBadge[v.status] || 'secondary'}>{v.status.replace('_', ' ')}</Badge>
            <span>·</span>
            <span>Occurred {formatDate(v.occurredAt)}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {v.status === 'open' && (
            <Button onClick={handleNotice} disabled={busy}>
              <Send className="mr-1.5 h-4 w-4" />
              Send notice
            </Button>
          )}
          {!v.fineInvoiceId && v.status !== 'closed' && v.status !== 'dismissed' && (
            <Button variant="secondary" onClick={() => setFineOpen(true)} disabled={busy}>
              <DollarSign className="mr-1.5 h-4 w-4" />
              Issue fine
            </Button>
          )}
          {v.status !== 'closed' && (
            <Button variant="secondary" onClick={() => setResolveOpen(true)} disabled={busy}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Close
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-caption uppercase tracking-wider text-muted-foreground">Estate</p>
                <p className="text-graphite">{v.unit?.estate?.name}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Tag className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-caption uppercase tracking-wider text-muted-foreground">Category</p>
                <p className="text-graphite">{v.category?.name}</p>
              </div>
            </div>
            {v.noticeSentAt && (
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-caption uppercase tracking-wider text-muted-foreground">Notice sent</p>
                  <p className="text-graphite">{formatDate(v.noticeSentAt)}</p>
                </div>
              </div>
            )}
          </div>
          <div>
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Description</p>
            <p className="mt-1 text-body text-graphite whitespace-pre-wrap">{v.description}</p>
          </div>
          {v.photos && v.photos.length > 0 && (
            <div>
              <p className="text-caption uppercase tracking-wider text-muted-foreground mb-2">Photo evidence ({v.photos.length})</p>
              <div className="flex flex-wrap gap-2">
                {v.photos.map((p: any, i: number) => (
                  <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-caption text-ember-orange hover:underline truncate max-w-xs">
                    {p.filename}
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {v.fineInvoice && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Fine</h3>
            <CardWarm className="mt-3 p-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-caption text-muted-foreground">{v.fineInvoice.invoiceNumber}</p>
                <p className="text-heading-sm font-display font-medium text-charcoal-primary">
                  {formatCurrency(Number(v.fineAmount), v.fineCurrency)}
                </p>
              </div>
              <Link href={`/finance/invoices/${v.fineInvoice.id}`}>
                <Button variant="secondary" size="sm">View invoice</Button>
              </Link>
            </CardWarm>
          </CardContent>
        </Card>
      )}

      {v.appeals && v.appeals.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Appeals</h3>
            <ul className="mt-3 divide-y divide-stone-surface">
              {v.appeals.map((a: any) => (
                <li key={a.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <Badge variant={a.status === 'upheld' ? 'success' : a.status === 'dismissed' ? 'destructive' : 'accent'}>
                        {a.status}
                      </Badge>
                      <p className="mt-1 text-body text-graphite whitespace-pre-wrap">{a.reason}</p>
                      <p className="text-caption text-muted-foreground mt-1">Submitted {formatDate(a.submittedAt)}</p>
                      {a.decisionNotes && (
                        <p className="text-caption text-graphite mt-2 p-2 card-warm rounded">{a.decisionNotes}</p>
                      )}
                    </div>
                    {(a.status === 'submitted' || a.status === 'reviewing') && (
                      <Button variant="secondary" size="sm" onClick={() => setAppealOpen(a)}>Decide</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {v.events && v.events.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Timeline</h3>
            <ul className="mt-3 space-y-2">
              {v.events.map((e: any) => (
                <li key={e.id} className="flex items-start gap-2 text-caption">
                  <MessageSquare className="mt-0.5 h-3 w-3 text-muted-foreground" />
                  <span className="text-graphite font-medium capitalize">{e.type.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground">— {formatDate(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Fine drawer */}
      <Drawer open={fineOpen} onOpenChange={setFineOpen}>
        <DrawerContent size="sm">
          <DrawerHeader>
            <DrawerTitle>Issue fine</DrawerTitle>
            <DrawerDescription>
              Auto-generates an invoice with the configured grace period as due date.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <div className="space-y-1.5">
              <Label htmlFor="fineAmount">Amount ({v.category?.fineCurrency || 'ZAR'})</Label>
              <Input
                id="fineAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder={v.category?.defaultFine ? `Default: ${v.category.defaultFine}` : '0.00'}
                value={fineAmount}
                onChange={(e) => setFineAmount(e.target.value)}
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button onClick={handleFine} disabled={busy}>{busy ? 'Issuing…' : 'Issue fine'}</Button>
            <DrawerClose asChild><Button variant="secondary">Cancel</Button></DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Resolve drawer */}
      <Drawer open={resolveOpen} onOpenChange={setResolveOpen}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>Close violation</DrawerTitle>
            <DrawerDescription>Resolution notes are recorded for audit.</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <textarea
              rows={6}
              className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
              placeholder="Outcome and rationale"
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
            />
          </DrawerBody>
          <DrawerFooter>
            <Button onClick={handleResolve} disabled={!resolveNotes.trim() || busy}>{busy ? 'Closing…' : 'Close violation'}</Button>
            <DrawerClose asChild><Button variant="secondary">Cancel</Button></DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Appeal decide drawer */}
      <Drawer open={!!appealOpen} onOpenChange={(o) => !o && setAppealOpen(null)}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>Decide appeal</DrawerTitle>
            <DrawerDescription>
              Upholding the appeal dismisses the violation; dismissing the appeal upholds the violation.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={decision === 'upheld' ? 'default' : 'secondary'}
                onClick={() => setDecision('upheld')}
                className="flex-1"
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Uphold appeal
              </Button>
              <Button
                variant={decision === 'dismissed' ? 'destructive' : 'secondary'}
                onClick={() => setDecision('dismissed')}
                className="flex-1"
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                Dismiss appeal
              </Button>
            </div>
            <textarea
              rows={6}
              className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
              placeholder="Decision rationale"
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
            />
          </DrawerBody>
          <DrawerFooter>
            <Button onClick={handleDecide} disabled={busy}>{busy ? 'Recording…' : 'Record decision'}</Button>
            <DrawerClose asChild><Button variant="secondary">Cancel</Button></DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
