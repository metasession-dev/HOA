'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

const ADMIN_ROLES = ['super_admin', 'hoa_admin', 'property_manager'];
const DISMISS_KEY = 'hoa_onboarding_dismissed';

/**
 * Compact "Setup X%" pill in the top bar — visible to admins until onboarding
 * is complete. Clicking re-opens the dashboard checklist (clears any dismissal)
 * so setup is always one tap away.
 */
export function SetupProgress() {
  const { primaryRole } = useAuth();
  const router = useRouter();
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    if (!ADMIN_ROLES.includes(primaryRole)) return;
    api
      .get<any>('/organizations/onboarding')
      .then((r) => {
        if (r?.data && !r.data.completed) setPct(r.data.percent);
      })
      .catch(() => {});
  }, [primaryRole]);

  if (pct == null) return null;

  const open = () => {
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
    router.push('/admin');
  };

  return (
    <button
      onClick={open}
      title="Finish setting up your HOA"
      className="hidden items-center gap-2 rounded-pill bg-ember-orange/10 px-3 py-1.5 text-caption font-medium text-ember-orange transition-colors hover:bg-ember-orange/15 sm:inline-flex"
    >
      <Rocket className="h-3.5 w-3.5" />
      <span>Setup {pct}%</span>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-ember-orange/25">
        <span className="block h-full rounded-full bg-ember-orange transition-all" style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}
