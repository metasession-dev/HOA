'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, CheckCircle2, X, AlertTriangle, UserPlus, Clock, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadAttachment, freshDownloadUrl } from '@/lib/files';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import { FileText } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

type Detail = any;

const ATTACH_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm', 'video/quicktime'];

function resolveFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}${url}`;
}

function AttachmentList({ items }: { items: Array<{ url: string; filename: string; contentType: string }> }) {
  // Persisted attachment URLs are short-lived signed links. Re-mint fresh URLs
  // on mount so inline images/videos load (they auto-fetch and can't wait for a
  // click), and re-sign downloads on click via downloadAttachment.
  const [urls, setUrls] = useState<(string | undefined)[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all((items || []).map((a) => freshDownloadUrl(a))).then((r) => { if (!cancelled) setUrls(r); });
    return () => { cancelled = true; };
  }, [items]);
  if (!items || items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-2">
      {items.map((a, i) => {
        const href = urls[i] || resolveFileUrl(a.url);
        return (
          <li key={i}>
            {a.contentType?.startsWith('video/') ? (
              <video controls className="w-full max-w-md rounded-lg" src={href} />
            ) : a.contentType?.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <button type="button" onClick={() => downloadAttachment(a)} className="block">
                <img src={href} alt={a.filename} className="max-h-64 rounded-lg object-contain ring-1 ring-stone-surface" />
              </button>
            ) : (
              <button type="button" onClick={() => downloadAttachment(a)} className="inline-flex items-center gap-2 text-sm text-ember-orange hover:underline text-left">
                <FileText className="h-4 w-4" /> {a.filename}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const ALL_TARGETS: Record<string, string[]> = {
  submitted: ['triaged', 'in_progress', 'cancelled'],
  triaged: ['in_progress', 'waiting_resident', 'resolved', 'cancelled'],
  in_progress: ['waiting_resident', 'resolved', 'cancelled'],
  waiting_resident: ['in_progress', 'resolved', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

const priorityBadge: Record<string, 'destructive' | 'warning' | 'info' | 'muted'> = {
  urgent: 'destructive', high: 'warning', normal: 'info', low: 'muted',
};
const statusBadge: Record<string, 'default' | 'info' | 'warning' | 'success' | 'muted' | 'destructive'> = {
  submitted: 'info', triaged: 'info', in_progress: 'warning',
  waiting_resident: 'warning', resolved: 'success', closed: 'muted', cancelled: 'destructive',
};

export default function AdminRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const [r, setR] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [commentFiles, setCommentFiles] = useState<UploadedFile[]>([]);
  const [internalNote, setInternalNote] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showResolve, setShowResolve] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<any>(`/requests/${params.id}`).then((res) => setR(res.data))
      .catch((err) => toast({ variant: 'error', title: 'Failed', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params.id]);

  const transition = async (to: string, extra: Record<string, any> = {}) => {
    const ok = await confirm({
      title: `Move to "${to.replace(/_/g, ' ')}"?`,
      description: `Current status: ${r.status.replace(/_/g, ' ')}.`,
      confirmText: 'Confirm',
      destructive: to === 'cancelled',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/requests/${params.id}/transition`, { to, ...extra });
      toast({ variant: 'success', title: `Moved to ${to.replace(/_/g, ' ')}` });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const resolve = async () => {
    setBusy(true);
    try {
      await api.post(`/requests/${params.id}/transition`, { to: 'resolved', resolutionNotes: resolutionNotes || undefined });
      toast({ variant: 'success', title: 'Resolved' });
      setShowResolve(false); setResolutionNotes('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const changePriority = async (priority: string) => {
    try {
      await api.post(`/requests/${params.id}/priority`, { priority });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() && commentFiles.length === 0) return;
    setBusy(true);
    try {
      await api.post(`/requests/${params.id}/comments`, {
        body: comment.trim() || '(see attachment)',
        isInternal: internalNote,
        attachments: commentFiles.map((a) => ({ url: a.url, filename: a.filename, contentType: a.contentType, size: a.size ?? 0 })),
      });
      setComment(''); setInternalNote(false); setCommentFiles([]);
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading || !r) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  const overdue = r.dueAt && new Date(r.dueAt) < new Date() && !['resolved', 'closed', 'cancelled'].includes(r.status);
  const validTargets = ALL_TARGETS[r.status] || [];

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-charcoal-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to queue
      </button>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={priorityBadge[r.priority] || 'muted'}>{r.priority}</Badge>
          <Badge variant={statusBadge[r.status] || 'muted'}>{r.status.replace(/_/g, ' ')}</Badge>
          <Badge variant="muted">{r.category.name}</Badge>
          {overdue && <Badge variant="destructive">overdue</Badge>}
        </div>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">{r.subject}</h1>
        <p className="text-caption text-muted-foreground">
          Filed {formatDate(r.createdAt)}
          {r.unit && ` · ${r.unit.estate.name} #${r.unit.unitNumber}`}
          {r.dueAt && ` · due ${formatDate(r.dueAt)}`}
          {r.assignedToUserId && ` · assigned`}
        </p>
      </header>

      <Card>
        <CardContent className="p-6 space-y-4">
          <p className="whitespace-pre-wrap text-graphite">{r.body}</p>
          {r.attachments?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-caption text-muted-foreground">Attachments</p>
              <AttachmentList items={r.attachments} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {validTargets.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={t === 'cancelled' ? 'destructive' : t === 'resolved' ? 'default' : 'secondary'}
            disabled={busy}
            onClick={() => t === 'resolved' ? setShowResolve(true) : transition(t)}
          >
            {t === 'resolved' ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> :
             t === 'cancelled' ? <X className="mr-1 h-3.5 w-3.5" /> :
             t === 'waiting_resident' ? <Clock className="mr-1 h-3.5 w-3.5" /> :
             <UserPlus className="mr-1 h-3.5 w-3.5" />}
            {t.replace(/_/g, ' ')}
          </Button>
        ))}
        <div className="ml-2 flex items-center gap-1">
          <span className="text-caption text-muted-foreground">priority:</span>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => changePriority(p)}
              disabled={busy || p === r.priority}
              className={cn(
                'rounded-pill px-2 py-0.5 text-[11px] font-medium transition-colors',
                p === r.priority ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Comments + timeline */}
      <section className="space-y-3">
        <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">Conversation</h2>
        <Card>
          <CardContent className="p-0">
            {r.comments?.length === 0 ? (
              <p className="p-6 text-caption text-muted-foreground">No comments yet.</p>
            ) : (
              <ul className="divide-y divide-stone-surface">
                {r.comments?.map((c: any) => {
                  const isStaff = c.authorType === 'staff';
                  return (
                    <li key={c.id} className={cn('p-4', isStaff ? 'border-l-2 border-l-ocean-blue bg-sky-blue/5' : 'border-l-2 border-l-meadow-green bg-meadow-green/5')}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isStaff ? 'info' : 'success'}>{isStaff ? 'HOA team' : 'Resident'}</Badge>
                        {c.isInternal && <Badge variant="muted"><Lock className="mr-1 h-2.5 w-2.5 inline" />internal</Badge>}
                        <span className="text-caption font-medium text-charcoal-primary">{c.authorName || 'Member'}</span>
                        <span className="text-caption text-muted-foreground">· {formatDate(c.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 text-sm text-graphite whitespace-pre-wrap">{c.body}</p>
                      <AttachmentList items={c.attachments || []} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <form onSubmit={addComment}>
          <Card>
            <CardContent className="p-4 space-y-3">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Reply to the resident, or leave an internal note…"
                className="flex min-h-[100px] w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <FileUpload
                value={commentFiles}
                onChange={setCommentFiles}
                kind="request_attachment"
                label="Attach (optional)"
                helpText="Photo, PDF, or short video (max 50MB each)."
                accept={ATTACH_ACCEPT}
                maxFiles={5}
              />
              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-caption text-graphite">
                  <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} />
                  Internal note (resident won&apos;t see)
                </label>
                <Button type="submit" size="sm" disabled={busy || (!comment.trim() && commentFiles.length === 0)}>
                  <MessageSquare className="mr-1 h-3.5 w-3.5" />Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </section>

      {/* Resolve drawer */}
      <Drawer open={showResolve} onOpenChange={setShowResolve}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>Resolve request</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rn">Resolution notes (optional)</Label>
              <textarea
                id="rn"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="What did you do? Resident sees this."
                className="flex min-h-[100px] w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button onClick={resolve} disabled={busy}>Resolve</Button>
            <Button variant="secondary" onClick={() => setShowResolve(false)}>Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
