'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    api.get<any>('/notifications?limit=10').then((r) => setItems(r.data || [])).catch(() => {});
    api.get<any>('/notifications/unread-count').then((r) => setUnread(r.data?.count || 0)).catch(() => {});
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      load();
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      load();
    } catch {}
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-graphite hover:bg-stone-surface"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ember-orange px-1 text-[10px] font-medium text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-card-lg bg-card p-2 shadow-inset-stone shadow-soft">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
              Notifications
            </p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-caption font-medium text-ember-orange hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-caption text-muted-foreground">No notifications</p>
            ) : (
              <ul>
                {items.map((n) => {
                  const isUnread = !n.readAt;
                  const body = (
                    <div
                      className={cn(
                        'cursor-pointer rounded-lg px-2 py-2 transition-colors hover:bg-stone-surface',
                        isUnread && 'bg-stone-surface/60',
                      )}
                      onClick={() => markRead(n.id)}
                    >
                      <div className="flex items-start gap-2">
                        {isUnread && (
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ember-orange" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-charcoal-primary truncate">{n.title}</p>
                          <p className="text-caption text-muted-foreground line-clamp-2">{n.body}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(n.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.actionUrl ? (
                        <Link href={n.actionUrl} onClick={() => setOpen(false)}>
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
