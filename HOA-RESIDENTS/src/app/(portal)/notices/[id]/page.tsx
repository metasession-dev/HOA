'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Paperclip, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

type Attachment = { url: string; filename: string; contentType: string; size?: number };

function resolveFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}${url}`;
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
                  <li key={i}>
                    {a.contentType?.startsWith('video/') ? (
                      <video controls className="w-full rounded-lg" src={resolveFileUrl(a.url)} />
                    ) : a.contentType?.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a href={resolveFileUrl(a.url)} target="_blank" rel="noopener noreferrer">
                        <img src={resolveFileUrl(a.url)} alt={a.filename} className="max-h-80 rounded-lg object-contain ring-1 ring-stone-surface" />
                      </a>
                    ) : (
                      <a
                        href={resolveFileUrl(a.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-graphite hover:text-ember-orange"
                      >
                        <FileText className="h-4 w-4" /> {a.filename}
                      </a>
                    )}
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
