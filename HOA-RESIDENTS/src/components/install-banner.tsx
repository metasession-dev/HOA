'use client';

/**
 * Phase 10.1 — A11Y/UX install prompt.
 *
 * Browsers fire `beforeinstallprompt` once we meet the install criteria
 * (manifest valid + served over HTTPS + SW registered + minimum engagement).
 * We capture it, suppress the default mini-infobar, and surface our own
 * banner so the prompt fits the resident-portal look.
 *
 * Dismissal is sticky — once a user clicks "Not now" we remember for 14 days
 * via localStorage so we don't pester them on every page load.
 */
import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';

const DISMISS_KEY = 'hoa.installBannerDismissedAt';
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function InstallBanner() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Already installed? Hide silently.
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'dismissed') {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setVisible(false);
    setEvent(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100">
          <Download className="h-5 w-5 text-stone-700" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-stone-900">Install HOA.africa</p>
          <p className="mt-1 text-xs text-stone-600">
            Add the resident app to your home screen for faster access and notifications.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
            >
              Install
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="text-stone-400 hover:text-stone-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
