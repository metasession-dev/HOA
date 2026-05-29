'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
