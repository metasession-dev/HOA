'use client';

/**
 * Phase 10.1 — Resident notifications inbox + push opt-in.
 *
 * Reads from /api/notifications (paginated). Bell badge auto-refreshes via
 * its own polling; opening this page marks-all-read as a UX shortcut.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { PushToggle } from '@/components/push-toggle';
import { cn } from '@/lib/utils';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/notifications?limit=50');
      setItems(res.data || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      load();
    } catch (_) {
      // ignore
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl text-charcoal-primary">Notifications</h1>
          <p className="text-sm text-muted-foreground">Updates from your estate and community.</p>
        </div>
        {items.some((n) => !n.readAt) && (
          <button
            type="button"
            onClick={markAllRead}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            Mark all read
          </button>
        )}
      </header>

      <PushToggle showTest />

      <section className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-muted-foreground">
            You&apos;re all caught up — no notifications yet.
          </p>
        )}
        {items.map((n) => {
          const inner = (
            <article
              className={cn(
                'rounded-2xl border border-stone-200 bg-white p-4 transition-colors hover:bg-stone-50',
                !n.readAt && 'border-amber-200 bg-amber-50/30',
              )}
            >
              <div className="flex items-start gap-3">
                {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-900">{n.title}</p>
                  <p className="mt-0.5 text-sm text-stone-600">{n.body}</p>
                  <p className="mt-1 text-xs text-stone-400">
                    {new Date(n.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
            </article>
          );
          return n.actionUrl ? (
            <Link key={n.id} href={n.actionUrl}>
              {inner}
            </Link>
          ) : (
            <div key={n.id}>{inner}</div>
          );
        })}
      </section>
    </div>
  );
}
