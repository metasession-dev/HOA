'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, X, Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STEP_DEFS = [
  { key: 'branding', title: 'Set up your organisation', desc: 'Currency, timezone & branding', href: '/settings', cta: 'Open settings' },
  { key: 'estate', title: 'Set up your estate', desc: 'Name your estate and add its address', href: '/admin/units', cta: 'Set up estate' },
  { key: 'units', title: 'Add your units', desc: 'Create or bulk-import your units', href: '/admin/units', cta: 'Add units' },
  { key: 'residents', title: 'Invite residents', desc: 'Give owners & tenants their portal', href: '/admin/people', cta: 'Invite residents' },
  { key: 'team', title: 'Invite your team', desc: 'Finance, exco & managers', href: '/admin/team', cta: 'Invite team' },
  { key: 'invoice', title: 'Issue your first levy', desc: 'Raise an invoice or recurring schedule', href: '/finance/invoices/new', cta: 'New invoice' },
];

const DISMISS_KEY = 'hoa_onboarding_dismissed';

/**
 * "Getting started" checklist — completion is computed server-side from live
 * data, so steps tick themselves off as the admin sets things up. The card
 * hides once everything is done or the admin dismisses it.
 */
export function GettingStarted() {
  const [state, setState] = useState<any>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
    api.get<any>('/organizations/onboarding').then((r) => setState(r.data)).catch(() => {});
  }, []);

  if (!state || dismissed || state.completed) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <Card className="overflow-hidden border-ember-orange/20">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ember-orange/10">
              <Rocket className="h-5 w-5 text-ember-orange" />
            </span>
            <div>
              <h2 className="font-display text-heading-sm font-medium text-charcoal-primary">Get started</h2>
              <p className="text-caption text-muted-foreground">
                {state.done} of {state.total} done · finish setting up your HOA
              </p>
            </div>
          </div>
          <button onClick={dismiss} className="rounded-full p-1 text-muted-foreground hover:bg-stone-surface" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-stone-surface">
          <div className="h-full rounded-full bg-ember-orange transition-all duration-500" style={{ width: `${state.percent}%` }} />
        </div>

        <ul className="mt-4 space-y-2">
          {STEP_DEFS.map((s) => {
            const done = !!state.steps?.[s.key];
            return (
              <li
                key={s.key}
                className={cn('flex items-center justify-between gap-3 rounded-lg border border-stone-surface p-3', done && 'opacity-70')}
              >
                <div className="flex items-center gap-3">
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full', done ? 'bg-meadow-green/15 text-meadow-green' : 'bg-stone-surface text-muted-foreground')}>
                    {done ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                  <div>
                    <p className={cn('text-sm font-medium text-charcoal-primary', done && 'line-through')}>{s.title}</p>
                    <p className="text-caption text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
                {!done && (
                  <Link href={s.href}>
                    <Button size="sm" variant="secondary">
                      {s.cta}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
