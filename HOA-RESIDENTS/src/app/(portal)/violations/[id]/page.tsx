'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, CheckCircle2, MessageSquare, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadAttachment } from '@/lib/files';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardWarm } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';

const statusBadge: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'accent'> = {
  open: 'warning',
  noticed: 'info',
  acknowledged: 'muted',
  appealing: 'accent',
  upheld: 'destructive',
  dismissed: 'success',
  closed: 'muted',
};

export default function ResidentViolationDetailPage() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [v, setV] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get<any>(`/violations/${id}`).then((r) => setV(r.data)).catch((err) => toast({ variant: 'error', title: 'Load failed', description: err.message })).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handleAcknowledge = async () => {
    const ok = await confirm({
      title: 'Acknowledge this notice?',
      description: 'This confirms you have seen the notice. You can still appeal within the grace period.',
      confirmText: 'Acknowledge',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/violations/${id}/acknowledge`);
      toast({ variant: 'success', title: 'Acknowledged' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!v) return <Card><CardContent className="p-10 text-center"><p className="text-body text-muted-foreground">Not found.</p></CardContent></Card>;

  const canAppeal = v.status === 'noticed' || v.status === 'acknowledged';

  return (
    <div className="space-y-6">
      <Link href="/violations" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />
        Violations
      </Link>

      <header>
        <p className="text-caption uppercase tracking-wider text-muted-foreground">{v.category?.name}</p>
        <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">
          Notice issued
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant={statusBadge[v.status] || 'secondary'}>{v.status.replace('_', ' ')}</Badge>
          <span className="text-caption text-muted-foreground inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Occurred {formatDate(v.occurredAt)}
          </span>
        </div>
      </header>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Description</p>
            <p className="mt-1 text-body text-graphite whitespace-pre-wrap">{v.description}</p>
          </div>
          {v.photos && v.photos.length > 0 && (
            <div>
              <p className="text-caption uppercase tracking-wider text-muted-foreground mb-1">Evidence</p>
              <div className="flex flex-wrap gap-2 text-caption">
                {v.photos.map((p: any, i: number) => (
                  <button key={i} type="button" onClick={() => downloadAttachment(p)} className="text-ember-orange hover:underline">{p.filename}</button>
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
            <CardWarm className="mt-3 p-4">
              <p className="font-mono text-caption text-muted-foreground">{v.fineInvoice.invoiceNumber}</p>
              <p className="text-heading-sm font-display font-medium text-charcoal-primary">
                {formatCurrency(Number(v.fineAmount))}
              </p>
              <p className="text-caption text-muted-foreground mt-1">Due {formatDate(v.fineInvoice.dueDate)}</p>
            </CardWarm>
            <Link href={`/invoices`} className="mt-3 inline-block text-caption text-ember-orange hover:underline">View invoices →</Link>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {v.status === 'noticed' && (
          <Button onClick={handleAcknowledge} disabled={busy}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Acknowledge notice
          </Button>
        )}
        {canAppeal && (
          <Link href={`/violations/${id}/appeal`}>
            <Button variant="secondary">
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Appeal
            </Button>
          </Link>
        )}
      </div>

      {v.appeals && v.appeals.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Your appeals</h3>
            <ul className="mt-3 divide-y divide-stone-surface">
              {v.appeals.map((a: any) => (
                <li key={a.id} className="py-3">
                  <Badge variant={a.status === 'upheld' ? 'success' : a.status === 'dismissed' ? 'destructive' : 'accent'}>{a.status}</Badge>
                  <p className="mt-1 text-body text-graphite whitespace-pre-wrap">{a.reason}</p>
                  <p className="text-caption text-muted-foreground mt-1">Submitted {formatDate(a.submittedAt)}</p>
                  {a.decisionNotes && <p className="text-caption text-graphite mt-2 p-2 card-warm rounded">{a.decisionNotes}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
