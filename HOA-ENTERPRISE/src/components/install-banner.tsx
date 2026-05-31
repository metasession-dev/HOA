'use client';

/**
 * Install prompt for the Enterprise PWA.
 *
 * Browsers fire `beforeinstallprompt` once the install criteria are met
 * (valid manifest + HTTPS + SW registered + some engagement). We capture it,
 * suppress the default mini-infobar, and surface our own banner so the prompt
 * matches the admin look and explains *why* installing helps (home-screen
 * shortcuts, faster launch).
 *
 * Dismissal is sticky for 14 days via localStorage so we don't nag on every
 * page load. Installed instances (display-mode: standalone) never see it.
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
    <div
      className="fixed inset-x-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
    >
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
          <Download className="h-5 w-5 text-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Install HOA.africa</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add the admin app to your home screen for one-tap shortcuts to invoices,
            broadcasts and gate passes.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Install
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
