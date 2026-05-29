'use client';

/**
 * Mobile bottom tab bar for the admin console. Shows four common destinations
 * plus a "More" tab that opens the full sectioned sidebar as a drawer (so every
 * role-gated section stays reachable). Replaces the sidebar on small screens.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Home, Users, Inbox, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRIMARY = [
  { title: 'Home', href: '/admin', icon: LayoutDashboard },
  { title: 'Units', href: '/admin/units', icon: Home },
  { title: 'People', href: '/admin/people', icon: Users },
  { title: 'Requests', href: '/admin/requests', icon: Inbox },
];

export function BottomNav({ onMore }: { onMore?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(href + '/');

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-sidebar-border bg-card lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      {PRIMARY.map((item) => {
        const active = isActive(item.href);
        return (
          <Link key={item.href} href={item.href} className="flex flex-1 flex-col items-center gap-0.5 py-2">
            <item.icon className={cn('h-5 w-5 transition-colors', active ? 'text-ember-orange' : 'text-graphite/70')} />
            <span className={cn('text-[10px] leading-tight', active ? 'font-medium text-charcoal-primary' : 'text-muted-foreground')}>
              {item.title}
            </span>
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className="flex flex-1 flex-col items-center gap-0.5 py-2" aria-label="More">
        <MoreHorizontal className="h-5 w-5 text-graphite/70" />
        <span className="text-[10px] leading-tight text-muted-foreground">More</span>
      </button>
    </nav>
  );
}
