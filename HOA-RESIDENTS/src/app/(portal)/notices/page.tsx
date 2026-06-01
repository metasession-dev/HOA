'use client';

import { useEffect, useState } from 'react';
import { Bell, FileText, Video, Download, Paperclip, ChevronLeft, Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadAttachment, freshDownloadUrl, resolveFileUrl } from '@/lib/files';
import { formatDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function AttachmentRow({ att }: { att: any }) {
  const isImage = att.contentType?.startsWith('image/');
  const isVideo = att.contentType?.startsWith('video/');
  const Icon = isVideo ? Video : FileText;
  // Re-mint a fresh signed URL on mount so the thumbnail doesn't 403 from expiry.
  const [thumb, setThumb] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    freshDownloadUrl(att).then((u) => { if (!cancelled) setThumb(u); });
    return () => { cancelled = true; };
  }, [att, isImage]);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-stone-surface bg-card p-2.5">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb || resolveFileUrl(att.url)} alt={att.filename} className="h-10 w-10 rounded object-cover ring-1 ring-stone-surface" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded bg-stone-surface text-graphite"><Icon className="h-5 w-5" /></span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-graphite">{att.filename}</span>
      <Button size="sm" variant="secondary" onClick={() => downloadAttachment(att)}>
        <Download className="mr-1 h-3.5 w-3.5" />Download
      </Button>
    </div>
  );
}

export default function NoticesPage() {
  const [notices, setNotices] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any>('/communications/broadcasts')
      .then((res) => {
        const list = [...(res.data || [])];
        list.sort(
          (a, b) => new Date(b.sentAt || b.createdAt).getTime() - new Date(a.sentAt || a.createdAt).getTime(),
        );
        setNotices(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const selected = notices.find((n) => n.id === selectedId) || null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Notices</h1>
        <p className="mt-1 text-body text-muted-foreground">Community broadcasts from your HOA.</p>
      </header>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : notices.length === 0 ? (
        <div className="rounded-card border border-stone-surface bg-card p-10 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface"><Bell className="h-5 w-5 text-graphite" /></div>
          <p className="mt-3 text-body font-medium text-charcoal-primary">No notices yet</p>
          <p className="text-caption text-muted-foreground">When your HOA sends a community update, it will appear here.</p>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-13rem)] overflow-hidden rounded-card border border-stone-surface bg-card">
          {/* Master list */}
          <div className={cn('flex w-full flex-col lg:w-80 lg:shrink-0 lg:border-r lg:border-stone-surface', selected && 'hidden lg:flex')}>
            <div className="flex-1 overflow-y-auto">
              <ul>
                {notices.map((n) => {
                  const active = n.id === selectedId;
                  const hasAtts = Array.isArray(n.attachments) && n.attachments.length > 0;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => setSelectedId(n.id)}
                        className={cn(
                          'flex w-full flex-col gap-0.5 border-b border-stone-surface px-4 py-3 text-left transition-colors',
                          active ? 'bg-sidebar-accent' : 'hover:bg-stone-surface/50',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-charcoal-primary">{n.subject}</span>
                          {hasAtts && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        </div>
                        <span className="truncate text-caption text-muted-foreground">{n.body}</span>
                        <span className="text-[11px] text-muted-foreground">{formatDate(n.sentAt || n.createdAt)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Reading pane */}
          <div className={cn('min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden lg:flex')}>
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-10 text-center">
                <div>
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface"><Inbox className="h-6 w-6 text-graphite" /></div>
                  <p className="mt-3 text-body text-muted-foreground">Select a notice to read it.</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6">
                <button onClick={() => setSelectedId(null)} className="mb-4 inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-charcoal-primary lg:hidden">
                  <ChevronLeft className="h-3.5 w-3.5" />Back
                </button>
                <h2 className="font-display text-heading-md font-medium text-charcoal-primary">{selected.subject}</h2>
                <p className="mt-1 text-caption text-muted-foreground">{formatDate(selected.sentAt || selected.createdAt)}</p>
                <div className="mt-5 whitespace-pre-wrap text-body leading-relaxed text-graphite">{selected.body}</div>

                {Array.isArray(selected.attachments) && selected.attachments.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-2 inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" />Attachments
                    </h3>
                    <div className="space-y-2">
                      {selected.attachments.map((a: any, i: number) => <AttachmentRow key={i} att={a} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
