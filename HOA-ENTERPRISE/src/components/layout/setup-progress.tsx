'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Rocket, Check, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';

const ADMIN_ROLES = ['super_admin', 'hoa_admin', 'property_manager'];
const DISMISS_KEY = 'hoa_onboarding_dismissed';

// Any flow that completes a setup step (add a unit, invite someone, issue a
// levy) can call this to refresh the "Setup X%" pill immediately, instead of
// waiting for the next navigation / focus / poll.
export const ONBOARDING_REFRESH_EVENT = 'hoa:onboarding-refresh';
export function refreshSetupProgress() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ONBOARDING_REFRESH_EVENT));
}

// Gentle safety-net poll so the pill catches changes made on the same page (or
// by a teammate) within this window, even without a navigation/focus event.
const POLL_MS = 30_000;

// Ordered step metadata — keys match GET /organizations/onboarding.steps.
const STEPS: { key: string; title: string; href: string }[] = [
  { key: 'branding', title: 'Set up your organisation', href: '/settings' },
  { key: 'estate', title: 'Set up your estate', href: '/admin/units' },
  { key: 'units', title: 'Add your units', href: '/admin/units' },
  { key: 'residents', title: 'Invite residents', href: '/admin/people' },
  { key: 'team', title: 'Invite your team', href: '/admin/team' },
  { key: 'invoice', title: 'Issue your first levy', href: '/finance/invoices/new' },
];

/**
 * Compact "Setup X%" pill in the top bar — visible to admins until onboarding
 * is complete. Clicking opens a popover showing exactly what's left, each with
 * a quick link.
 */
export function SetupProgress() {
  const { primaryRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const isAdmin = ADMIN_ROLES.includes(primaryRole);

  // Re-pull live onboarding state. It's fully derived from DB counts server-side,
  // so each call reflects the latest reality; once complete, the pill hides.
  const refresh = useCallback(() => {
    if (!isAdmin) return;
    api
      .get<any>('/organizations/onboarding')
      .then((r) => {
        if (r?.data) setState(r.data.completed ? null : r.data);
      })
      .catch(() => {});
  }, [isAdmin]);

  // Initial load + refetch on every navigation (catches steps finished on
  // another page) and whenever the org changes role context.
  useEffect(() => { refresh(); }, [refresh, pathname]);

  // Realtime-ish triggers without a socket: refresh when the tab regains focus
  // or visibility, on an explicit refreshSetupProgress() broadcast, and on a
  // gentle interval as a backstop. All disabled for non-admins / when complete.
  useEffect(() => {
    if (!isAdmin) return;
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(ONBOARDING_REFRESH_EVENT, refresh);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(ONBOARDING_REFRESH_EVENT, refresh);
      window.clearInterval(id);
    };
  }, [isAdmin, refresh]);

  if (!state) return null;

  const openFullChecklist = () => {
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
    setOpen(false);
    router.push('/admin');
  };

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Finish setting up your HOA"
        className="inline-flex items-center gap-2 rounded-pill bg-ember-orange/10 px-3 py-1.5 text-caption font-medium text-ember-orange transition-colors hover:bg-ember-orange/15"
      >
        <Rocket className="h-3.5 w-3.5" />
        <span>Setup {state.percent}%</span>
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-ember-orange/25">
          <span className="block h-full rounded-full bg-ember-orange transition-all" style={{ width: `${state.percent}%` }} />
        </span>
      </button>

      {open && (
        <>
          {/* Click-away layer */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-card border border-stone-surface bg-card p-4 shadow-soft">
            <div className="mb-1 flex items-center justify-between">
              <p className="font-display text-sm font-medium text-charcoal-primary">Finish your setup</p>
              <span className="text-caption text-muted-foreground">{state.done}/{state.total}</span>
            </div>
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-surface">
              <div className="h-full rounded-full bg-ember-orange transition-all" style={{ width: `${state.percent}%` }} />
            </div>

            <ul className="space-y-1">
              {STEPS.map((s) => {
                const done = !!state.steps?.[s.key];
                return done ? (
                  <li key={s.key} className="flex items-center gap-2 px-1 py-1.5 text-sm text-muted-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-meadow-green/15 text-meadow-green">
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="line-through">{s.title}</span>
                  </li>
                ) : (
                  <li key={s.key}>
                    <Link
                      href={s.href}
                      onClick={() => setOpen(false)}
                      className="group flex items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-sm text-charcoal-primary hover:bg-stone-surface"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-5 w-5 shrink-0 rounded-full border border-dashed border-graphite/40" />
                        {s.title}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={openFullChecklist}
              className={cn('mt-3 w-full rounded-lg bg-stone-surface px-3 py-2 text-caption font-medium text-graphite transition-colors hover:bg-stone-surface/70')}
            >
              Open full checklist
            </button>
          </div>
        </>
      )}
    </div>
  );
}
