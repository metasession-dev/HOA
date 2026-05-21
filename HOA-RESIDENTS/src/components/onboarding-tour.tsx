'use client';

/**
 * Phase 10.2 — first-run welcome tour.
 *
 * Shown once per resident on the first portal visit. Dismissal is sticky via
 * localStorage so refreshes / re-logins don't re-trigger it. Five short
 * panels covering the main flows; non-modal escape (overlay click + Esc).
 *
 * Hosts the HOA logo + tagline at the top so the experience feels branded
 * from the very first session.
 */
import { useEffect, useState } from 'react';
import { ArrowRight, X, FileText, CreditCard, Users, BellRing, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useBranding } from '@/providers/branding-provider';

const STORAGE_KEY = 'hoa.onboardingCompleted';

interface Step {
  Icon: typeof FileText;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    Icon: FileText,
    title: 'Your statement, always current',
    body: 'See every levy, payment and invoice for your unit at a glance — and pay in two taps.',
  },
  {
    Icon: CreditCard,
    title: 'Pay levies in seconds',
    body: 'Card, EFT, or mobile money. Get an instant receipt and your unit goes back to "paid up".',
  },
  {
    Icon: Users,
    title: 'Visitors, simplified',
    body: 'Pre-book guests and contractors. Share a one-tap pass — the gate scans the QR and lets them in.',
  },
  {
    Icon: BellRing,
    title: 'Stay in the loop',
    body: 'Vote on motions, log maintenance requests and read estate notices — all in one place.',
  },
  {
    Icon: ShieldCheck,
    title: 'Built for your privacy',
    body: 'POPIA-compliant. Your data stays with your HOA — request an export or deletion any time.',
  },
];

export function OnboardingTour() {
  const { user } = useAuth();
  const { organizationName, tagline, logoUrl } = useBranding();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    setVisible(true);
  }, [user]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  };

  const finish = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    }
    setVisible(false);
  };

  if (!visible) return null;
  const current = STEPS[step];
  const Icon = current.Icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to HOA.africa"
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/30 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={organizationName} className="h-9 w-9 rounded-lg object-contain" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 text-sm font-semibold text-white">
                {organizationName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-stone-900">{organizationName}</p>
              {tagline && <p className="text-xs text-stone-500">{tagline}</p>}
            </div>
          </div>
          <button
            onClick={finish}
            aria-label="Close tour"
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{ backgroundColor: 'var(--brand-accent, #ff6230)' }}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl text-stone-900">{current.title}</h2>
            <p className="mt-1 text-sm text-stone-600">{current.body}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6' : 'w-1.5 bg-stone-300'
                }`}
                style={i === step ? { backgroundColor: 'var(--brand-accent, #ff6230)' } : undefined}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            {step < STEPS.length - 1 && (
              <button onClick={finish} className="text-xs font-medium text-stone-500 hover:text-stone-700">
                Skip
              </button>
            )}
            <button
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--brand-accent, #ff6230)' }}
            >
              {step === STEPS.length - 1 ? 'Get started' : 'Next'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
