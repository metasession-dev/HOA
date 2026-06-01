'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Receipt, FileText, Bell, KeyRound, ShieldAlert, Vote, ClipboardList, ChevronLeft, ChevronRight, Wallet, UserCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export const mainNav = [
  { title: 'Dashboard', href: '/', icon: Home },
  { title: 'Invoices', href: '/invoices', icon: Receipt },
  { title: 'Pay ahead', href: '/prepay', icon: Wallet },
  { title: 'Gate passes', href: '/passes', icon: KeyRound },
  { title: 'Violations', href: '/violations', icon: ShieldAlert },
  { title: 'Votes', href: '/votes', icon: Vote },
  { title: 'Surveys', href: '/surveys', icon: ClipboardList },
  { title: 'Requests', href: '/requests', icon: FileText },
  { title: 'Notices', href: '/notices', icon: Bell },
  { title: 'My account', href: '/profile', icon: UserCircle },
];

/**
 * Which nav item is active. Longest-matching-href wins so a detail route
 * (/invoices/123) keeps its parent (/invoices) highlighted, while a sibling or
 * shorter-prefix route never lights up alongside the more specific one. Returns
 * the single active href (or null).
 */
export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const h of hrefs) {
    const matches = pathname === h || (h !== '/' && pathname.startsWith(h + '/'));
    if (matches && (!best || h.length > best.length)) best = h;
  }
  return best;
}

export function Sidebar() {
  const pathname = usePathname();
  const { organizationName } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const nav = mainNav;
  const portalLabel = 'Resident portal';
  const activeHref = activeNavHref(pathname, nav.map((i) => i.href));

  return (
    <aside
      className={cn(
        // Desktop only — on mobile the bottom tab bar replaces the sidebar.
        'hidden lg:flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-spring',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className={cn('flex items-center h-16 px-4', collapsed ? 'justify-center' : 'gap-3')}>
        {/* HOA.africa brand mark — green house + Africa silhouette with nodes. */}
        <img src="/icons/logo.png" alt="HOA.africa" className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-charcoal-primary truncate leading-tight">
              {organizationName}
            </p>
            <p className="text-caption text-muted-foreground">{portalLabel}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {!collapsed && (
          <h4 className="px-3 pb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Your portal
          </h4>
        )}
        {nav.map((item) => {
          const isActive = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors duration-200',
                isActive
                  ? 'bg-sidebar-accent text-charcoal-primary font-medium'
                  : 'text-graphite hover:bg-sidebar-accent hover:text-charcoal-primary',
                collapsed && 'justify-center px-2',
              )}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-ember-orange"
                  aria-hidden
                />
              )}
              <item.icon
                className={cn(
                  'h-[18px] w-[18px] shrink-0 transition-colors',
                  isActive ? 'text-ember-orange' : 'text-graphite/70 group-hover:text-graphite',
                )}
              />
              {!collapsed && <span className="truncate">{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t border-sidebar-border p-4">
          <p className="text-caption text-muted-foreground">
            Need help? Reach your HOA at <span className="text-ember-orange">dev@metasession.co</span>
          </p>
        </div>
      )}
    </aside>
  );
}
