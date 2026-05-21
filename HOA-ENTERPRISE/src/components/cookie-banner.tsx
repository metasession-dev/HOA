'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const STORAGE_KEY = 'hoa.cookie-consent';
// Bump this when the privacy policy changes — returning users will re-see the
// banner so consent is freshly granted against the new policy.
const POLICY_VERSION = 'v1';

type Decision = 'accepted' | 'rejected';
type Stored = { decision: Decision; at: string; policyVersion: string };

/**
 * Phase 8.3 cookie banner. Persists the decision in localStorage AND fires a
 * Consent record on the API for the POPIA evidentiary log. Auth is optional —
 * unauthenticated visitors still get the local-only stash so the banner stops
 * appearing; once they sign in, the next decision change writes to the server.
 */
export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setShow(true); return; }
      // Review #17: validate shape and policy version. If the policy bumped
      // since the user last decided, ask again.
      const parsed = JSON.parse(raw) as Partial<Stored>;
      if (!parsed?.decision || (parsed.policyVersion !== POLICY_VERSION)) {
        setShow(true);
      }
    } catch {
      setShow(true);
    }
  }, []);

  const decide = async (decision: Decision) => {
    const record: Stored = { decision, at: new Date().toISOString(), policyVersion: POLICY_VERSION };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch { /* no-op */ }

    // Best-effort: record server-side if the user is authenticated.
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('hoa_token') : null;
      if (token) {
        await api.post('/privacy/consent', {
          consentType: 'analytics_cookies',
          state: decision === 'accepted' ? 'given' : 'withdrawn',
          policyVersion: POLICY_VERSION,
        });
      }
    } catch { /* swallow — banner is informational */ }

    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-stone-surface bg-card p-4 shadow-soft sm:flex-row sm:items-center">
        <Cookie className="hidden h-6 w-6 shrink-0 text-deep-amber sm:block" aria-hidden />
        <div className="flex-1 text-caption text-graphite">
          We use a small set of cookies to keep you signed in and to understand usage. Read more in our{' '}
          <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => decide('rejected')}>
            <X className="mr-1 h-3.5 w-3.5" /> Reject non-essential
          </Button>
          <Button size="sm" onClick={() => decide('accepted')}>Accept all</Button>
        </div>
      </div>
    </div>
  );
}
