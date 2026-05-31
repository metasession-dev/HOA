'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Paperclip, FileText, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

type Attachment = { url: string; filename: string; contentType: string; size?: number; storedFileId?: string };

function resolveFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}${url}`;
}

/** Download via a fresh signed URL so links never 403 from expiry. */
async function downloadAttachment(att: Attachment) {
  try {
    if (att.storedFileId) {
      const r = await api.get<any>(`/files/${att.storedFileId}`);
      const url = r.data?.downloadUrl;
      if (url) { window.open(resolveFileUrl(url), '_blank'); return; }
    }
    window.open(resolveFileUrl(att.url), '_blank');
  } catch {
    window.open(resolveFileUrl(att.url), '_blank');
  }
}

export default function NoticeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [notice, setNotice] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any>(`/communications/broadcasts/${id}`)
      .then((r) => setNotice(r.data))
      .catch((err) => toast({ variant: 'error', title: 'Could not load notice', description: err.message }))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-charcoal-primary">
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <Card><CardContent className="p-10 text-center text-muted-foreground">This notice is no longer available.</CardContent></Card>
      </div>
    );
  }

  const attachments: Attachment[] = Array.isArray(notice.attachments) ? notice.attachments : [];

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-charcoal-primary">
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>

      <header className="space-y-1">
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">{notice.subject}</h1>
        <p className="text-caption text-muted-foreground">{formatDate(notice.sentAt || notice.createdAt)}</p>
      </header>

      <Card>
        <CardContent className="p-6">
          <p className="text-body text-graphite whitespace-pre-wrap leading-relaxed">{notice.body}</p>
        </CardContent>
      </Card>

      {attachments.length > 0 && (
        <section className="space-y-2">
          <h2 className="inline-flex items-center gap-1.5 text-heading-sm font-display font-medium text-charcoal-primary">
            <Paperclip className="h-4 w-4" /> Attachments
          </h2>
          <Card>
            <CardContent className="p-4">
              <ul className="space-y-2">
                {attachments.map((a, i) => (
                  <li key={i} className="space-y-2">
                    {a.contentType?.startsWith('video/') ? (
                      <video controls className="w-full rounded-lg" src={resolveFileUrl(a.url)} />
                    ) : a.contentType?.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveFileUrl(a.url)} alt={a.filename} className="max-h-80 rounded-lg object-contain ring-1 ring-stone-surface" />
                    ) : null}
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm text-graphite">{a.filename}</span>
                      <Button size="sm" variant="secondary" onClick={() => downloadAttachment(a)}>
                        <Download className="mr-1 h-3.5 w-3.5" />Download
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
