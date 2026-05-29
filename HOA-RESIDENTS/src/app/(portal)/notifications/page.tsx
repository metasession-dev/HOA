'use client';

/**
 * Resident notifications inbox. A proper, scannable list — type icons, clear
 * unread styling, per-item "mark read" and a "mark all read" action. Reads
 * from /api/notifications (paginated). The bell badge polls independently.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell, Megaphone, Receipt, CreditCard, ShieldAlert, Vote, Inbox, KeyRound,
  Check, CheckCheck, ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { PushToggle } from '@/components/push-toggle';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
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

// Map a notification type to an icon + tint so the inbox reads at a glance.
const typeMeta: Record<string, { icon: typeof Bell; tint: string }> = {
  broadcast: { icon: Megaphone, tint: 'text-ember-orange bg-ember-orange/10' },
  invoice_issued: { icon: Receipt, tint: 'text-info bg-info/10' },
  payment_received: { icon: CreditCard, tint: 'text-meadow-green bg-meadow-green/10' },
  violation_issued: { icon: ShieldAlert, tint: 'text-coral-red bg-coral-red/10' },
  vote_opened: { icon: Vote, tint: 'text-info bg-info/10' },
  request_update: { icon: Inbox, tint: 'text-graphite bg-stone-surface' },
  gate_pass: { icon: KeyRound, tint: 'text-graphite bg-stone-surface' },
};
const metaFor = (type: string) => typeMeta[type] || { icon: Bell, tint: 'text-graphite bg-stone-surface' };

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' } as any);
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  useEffect(() => { load(); }, []);

  const unreadCount = items.filter((n) => !n.readAt).length;

  const markRead = async (id: string) => {
    setBusyId(id);
    // Optimistic — flip locally, reconcile on error.
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    try {
      await api.post(`/notifications/${id}/read`);
    } catch {
      load();
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    const now = new Date().toISOString();
    setItems((cur) => cur.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    try {
      await api.post('/notifications/read-all');
      toast({ variant: 'success', title: 'All caught up' });
    } catch {
      load();
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Notifications</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Updates from your estate and community.
            {unreadCount > 0 && <span className="ml-1 text-graphite">· {unreadCount} unread</span>}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={markAllRead}>
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Mark all read
          </Button>
        )}
      </header>

      <PushToggle showTest />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-body text-coral-red">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={load}>Try again</Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
              <Bell className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body font-medium text-charcoal-primary">You&apos;re all caught up</p>
            <p className="text-caption text-muted-foreground">New notices and updates will show up here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-stone-surface">
              {items.map((n) => {
                const meta = metaFor(n.type);
                const Icon = meta.icon;
                const unread = !n.readAt;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3.5 transition-colors sm:px-5',
                      unread && 'bg-ember-orange/[0.04]',
                    )}
                  >
                    <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', meta.tint)}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className={cn('text-sm text-charcoal-primary', unread ? 'font-semibold' : 'font-medium')}>
                          {n.title}
                        </p>
                        {unread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember-orange" aria-label="unread" />}
                      </div>
                      <p className="mt-0.5 text-sm text-graphite whitespace-pre-wrap leading-relaxed line-clamp-3">{n.body}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-caption text-muted-foreground">{timeAgo(n.createdAt)}</span>
                        {n.actionUrl && (
                          <Link
                            href={n.actionUrl}
                            onClick={() => unread && markRead(n.id)}
                            className="inline-flex items-center gap-1 text-caption font-medium text-ember-orange hover:underline"
                          >
                            View <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                        {unread && (
                          <button
                            type="button"
                            onClick={() => markRead(n.id)}
                            disabled={busyId === n.id}
                            className="inline-flex items-center gap-1 text-caption font-medium text-muted-foreground hover:text-graphite disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" /> Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
