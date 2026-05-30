'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';

const SEEN_KEY = 'hoa_welcome_seen';

const POINTS: [string, string][] = [
  ['Settings first', 'Set your currency, timezone and branding — they flow into invoices, the resident app and every email.'],
  ['Units & people', 'Add units, then invite residents and your team. Everyone gets role-based access to exactly what they need.'],
  ['Money in & out', 'Issue levies and invoices, and run vendor payables through approval chains — with a full audit trail.'],
  ['Residents & vendors self-serve', 'Residents pay and raise requests in their app; vendors submit invoices and bid on contracts in theirs.'],
];

/**
 * First-run welcome modal for new admins. Shows once per browser; the
 * "Getting started" card on the dashboard carries the ongoing checklist.
 */
export function WelcomeDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== '1') setOpen(true);
    } catch { /* ignore */ }
  }, []);

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-ember-orange/10">
            <Sparkles className="h-5 w-5 text-ember-orange" />
          </div>
          <DialogTitle className="font-display text-xl font-semibold text-charcoal-primary">
            Welcome to HOA.africa{user?.firstName ? `, ${user.firstName}` : ''} 🎉
          </DialogTitle>
          <DialogDescription>
            This is your command centre for the whole estate. Here&apos;s the lay of the land before you dive in.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 py-1 text-sm">
          {POINTS.map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember-orange" />
              <span>
                <strong className="text-charcoal-primary">{t}.</strong>{' '}
                <span className="text-muted-foreground">{d}</span>
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="secondary" onClick={close}>Explore on my own</Button>
          <Link href="/settings" onClick={close}><Button>Start with settings</Button></Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
