'use client';

/**
 * "New update available" prompt for the PWA.
 *
 * next-pwa registers the service worker with `skipWaiting: false`, so when a new
 * build ships the freshly-installed worker sits in the `waiting` state instead
 * of taking over silently. We detect that worker and surface a non-blocking
 * banner; accepting it posts `SKIP_WAITING` (handled in custom-sw.js) and the
 * `controllerchange` listener reloads the page once the new worker is active.
 *
 * This only does anything in production — next-pwa disables the SW in dev.
 */
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

export function PwaUpdater() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    // A worker is a *real* update (not the very first install) only when there's
    // already a controller on the page.
    const offerUpdate = (sw: ServiceWorker | null) => {
      if (sw && navigator.serviceWorker.controller) setWaiting(sw);
    };

    const trackInstalling = (reg: ServiceWorkerRegistration) => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') offerUpdate(reg.waiting ?? installing);
      });
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      registration = reg;
      // Update already downloaded before this component mounted.
      if (reg.waiting) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => trackInstalling(reg));
    });

    // Re-check for a new build hourly while the app stays open, plus whenever
    // the tab regains focus — long-lived installed PWAs rarely get reloaded.
    const checkForUpdate = () => registration?.update().catch(() => {});
    const interval = setInterval(checkForUpdate, 60 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdate(); };
    document.addEventListener('visibilitychange', onVisible);

    const onControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  const applyUpdate = () => {
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // onControllerChange reloads once the new worker takes control.
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 z-[60] sm:left-auto sm:right-4 sm:max-w-sm"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
    >
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
          <RefreshCw className="h-5 w-5 text-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Update available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            A new version of HOA.africa is ready. Reload to get the latest features and fixes.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={applyUpdate}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Update now
            </button>
            <button
              type="button"
              onClick={() => setWaiting(null)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
            >
              Later
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setWaiting(null)}
          aria-label="Dismiss update prompt"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
