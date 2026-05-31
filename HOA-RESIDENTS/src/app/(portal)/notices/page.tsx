'use client';

import { useEffect, useState } from 'react';
import { Bell, FileText, Video } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function resolveFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}${url}`;
}

function NoticeAttachments({ items }: { items: Array<{ url: string; filename: string; contentType: string }> }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {items.map((a, i) =>
        a.contentType?.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <a key={i} href={resolveFileUrl(a.url)} target="_blank" rel="noopener noreferrer" title={a.filename}>
            <img src={resolveFileUrl(a.url)} alt={a.filename} className="h-20 w-20 rounded-lg object-cover ring-1 ring-stone-surface" />
          </a>
        ) : (
          <a
            key={i}
            href={resolveFileUrl(a.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-surface/60 px-3 py-1.5 text-caption text-graphite hover:text-ember-orange"
          >
            {a.contentType?.startsWith('video/') ? <Video className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            {a.filename}
          </a>
        ),
      )}
    </div>
  );
}

export default function NoticesPage() {
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any>('/communications/broadcasts')
      .then((res) => {
        const list = [...(res.data || [])];
        // Latest first — order by when the notice was sent (falling back to
        // created), so a recently-sent older draft still shows at the top.
        list.sort(
          (a, b) =>
            new Date(b.sentAt || b.createdAt).getTime() - new Date(a.sentAt || a.createdAt).getTime(),
        );
        setNotices(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Notices</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Community broadcasts from your HOA.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : notices.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
              <Bell className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No notices yet</p>
            <p className="text-caption text-muted-foreground">
              When your HOA sends a community update, it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notices.map((n: any) => (
            <Card key={n.id}>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-heading-sm font-medium text-charcoal-primary">{n.subject}</h3>
                  <span className="text-caption text-muted-foreground">
                    {formatDate(n.sentAt || n.createdAt)}
                  </span>
                </div>
                <p className="mt-3 text-body text-graphite whitespace-pre-wrap leading-relaxed">{n.body}</p>
                <NoticeAttachments items={n.attachments || []} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
