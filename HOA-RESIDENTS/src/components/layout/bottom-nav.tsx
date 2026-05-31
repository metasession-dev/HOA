'use client';

/**
 * Mobile bottom tab bar. Replaces the sidebar on small screens for a
 * native-app feel. Shows the four primary destinations plus a "More" sheet
 * that lists everything else so nothing is buried.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mainNav, activeNavHref } from './sidebar';

// The four quick-access tabs for residents (rest live under "More").
const PRIMARY_HREFS = ['/', '/invoices', '/passes', '/notices'];

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet whenever the route changes.
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const nav = mainNav;
  // Longest-prefix-wins so a detail route keeps only its parent active.
  const activeHref = activeNavHref(pathname, nav.map((i) => i.href));
  const isActive = (href: string) => href === activeHref;
  const primaryHrefs = PRIMARY_HREFS;
  const primary = primaryHrefs
    .map((h) => nav.find((i) => i.href === h))
    .filter(Boolean) as typeof nav;
  const moreItems = nav.filter((i) => !primaryHrefs.includes(i.href));
  const moreActive = moreItems.some((i) => isActive(i.href));

  return (
    <>
      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-midnight/30 backdrop-blur-[1px]" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-card-lg bg-card p-4 shadow-soft"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">More</p>
              <button onClick={() => setMoreOpen(false)} className="rounded-full p-1 text-muted-foreground hover:bg-stone-surface" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg p-3 text-center transition-colors',
                      active ? 'bg-sidebar-accent text-charcoal-primary' : 'text-graphite hover:bg-stone-surface',
                    )}
                  >
                    <item.icon className={cn('h-5 w-5', active ? 'text-ember-orange' : 'text-graphite/70')} />
                    <span className="text-caption leading-tight">{item.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-sidebar-border bg-card lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Primary"
      >
        {primary.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} className="flex flex-1 flex-col items-center gap-0.5 py-2">
              <item.icon className={cn('h-5 w-5 transition-colors', active ? 'text-ember-orange' : 'text-graphite/70')} />
              <span className={cn('text-[10px] leading-tight', active ? 'font-medium text-charcoal-primary' : 'text-muted-foreground')}>
                {item.title === 'Gate passes' ? 'Passes' : item.title}
              </span>
            </Link>
          );
        })}
        {moreItems.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2"
            aria-label="More"
          >
            <MoreHorizontal className={cn('h-5 w-5', moreActive ? 'text-ember-orange' : 'text-graphite/70')} />
            <span className={cn('text-[10px] leading-tight', moreActive ? 'font-medium text-charcoal-primary' : 'text-muted-foreground')}>More</span>
          </button>
        )}
      </nav>
    </>
  );
}
