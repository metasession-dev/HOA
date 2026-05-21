'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, MessageSquare, CheckCircle2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';

const statusBadge: Record<string, 'default' | 'info' | 'warning' | 'success' | 'muted' | 'destructive'> = {
  submitted: 'info', triaged: 'info', in_progress: 'warning',
  waiting_resident: 'warning', resolved: 'success', closed: 'muted', cancelled: 'destructive',
};

export default function ResidentRequestDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const [r, setR] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');

  const load = () => {
    setLoading(true);
    api.get<any>(`/requests/${params.id}`).then((res) => setR(res.data))
      .catch((err) => toast({ variant: 'error', title: 'Failed', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params.id]);

  const transition = async (to: string, opts: { destructive?: boolean; title: string } = { title: 'Confirm' }) => {
    const ok = await confirm({
      title: opts.title,
      description: 'This cannot be undone.',
      confirmText: 'Confirm',
      destructive: opts.destructive,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/requests/${params.id}/transition`, { to });
      toast({ variant: 'success', title: 'Done' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/requests/${params.id}/comments`, { body: comment });
      setComment('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading || !r) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  const isOwnSubmission = true; // server-scoped; this page only shows visible-to-resident
  const canCancel = ['submitted', 'triaged', 'waiting_resident'].includes(r.status);
  const canClose = r.status === 'resolved';

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-charcoal-primary">
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusBadge[r.status] || 'muted'}>{r.status.replace(/_/g, ' ')}</Badge>
          <Badge variant="muted">{r.category?.name}</Badge>
        </div>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">{r.subject}</h1>
        <p className="text-caption text-muted-foreground">
          Filed {formatDate(r.createdAt)}
          {r.dueAt && ` · expected response by ${formatDate(r.dueAt)}`}
        </p>
      </header>

      <Card>
        <CardContent className="p-6">
          <p className="whitespace-pre-wrap text-graphite">{r.body}</p>
          {r.resolutionNotes && (
            <div className="mt-4 rounded-lg bg-meadow-green/10 p-3">
              <p className="text-caption font-medium text-meadow-green">Resolution from the team</p>
              <p className="text-sm text-graphite mt-1 whitespace-pre-wrap">{r.resolutionNotes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        {canCancel && (
          <Button size="sm" variant="destructive" disabled={busy}
            onClick={() => transition('cancelled', { title: 'Cancel this request?', destructive: true })}>
            <X className="mr-1 h-3.5 w-3.5" />Cancel
          </Button>
        )}
        {canClose && (
          <Button size="sm" disabled={busy}
            onClick={() => transition('closed', { title: 'Mark as closed?' })}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Confirm resolved
          </Button>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">Conversation</h2>
        <Card>
          <CardContent className="p-0">
            {r.comments?.length === 0 ? (
              <p className="p-6 text-caption text-muted-foreground">No replies yet — the team will respond here.</p>
            ) : (
              <ul className="divide-y divide-stone-surface">
                {r.comments?.map((c: any) => (
                  <li key={c.id} className="p-4">
                    <p className="text-caption text-muted-foreground">{formatDate(c.createdAt)}</p>
                    <p className="mt-1 text-sm text-graphite whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {!['closed', 'cancelled'].includes(r.status) && (
          <form onSubmit={addComment}>
            <Card>
              <CardContent className="p-4 space-y-3">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a reply…"
                  className="flex min-h-[100px] w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={busy || !comment.trim()}>
                    <MessageSquare className="mr-1 h-3.5 w-3.5" />Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        )}
      </section>
    </div>
  );
}
