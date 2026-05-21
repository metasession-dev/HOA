'use client';

/**
 * Phase 10.1 — Push notification toggle for settings / onboarding.
 *
 * Mirrors the browser's `Notification.permission` state so the UI reflects
 * reality even after the user toggles it from the URL bar or system settings.
 * "Test" button is hidden in production by default — too easy to abuse.
 */
import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { getPushSupport, getCurrentSubscription, subscribeToPush, unsubscribeFromPush } from '@/lib/push';
import { api } from '@/lib/api';

type Status = 'loading' | 'unsupported' | 'denied' | 'inactive' | 'active' | 'pending';

export function PushToggle({ showTest = false }: { showTest?: boolean }) {
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = getPushSupport();
      if (!support.supported) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      if (support.permission === 'denied') {
        if (!cancelled) setStatus('denied');
        return;
      }
      const sub = await getCurrentSubscription();
      if (!cancelled) setStatus(sub ? 'active' : 'inactive');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnable = async () => {
    setStatus('pending');
    setMessage(null);
    try {
      const res = await subscribeToPush();
      if (res.subscribed) {
        setStatus('active');
        setMessage('Notifications enabled on this device.');
      } else {
        setStatus(res.reason === 'denied' ? 'denied' : 'inactive');
        setMessage(
          res.reason === 'denied'
            ? 'Permission denied. You can re-enable it in your browser settings.'
            : res.reason === 'unsupported'
              ? 'Your browser does not support push notifications.'
              : 'Could not enable notifications. Please try again.',
        );
      }
    } catch (err) {
      setStatus('inactive');
      setMessage('Could not enable notifications. Please try again.');
    }
  };

  const handleDisable = async () => {
    setStatus('pending');
    try {
      await unsubscribeFromPush();
      setStatus('inactive');
      setMessage('Notifications disabled on this device.');
    } catch (err) {
      setStatus('active');
      setMessage('Could not disable. Please try again.');
    }
  };

  const handleTest = async () => {
    try {
      const res: any = await api.post('/notifications/push/test', { title: 'HOA.africa test', body: 'You should see this on your device.' });
      setMessage(`Test sent — delivered ${res?.data?.delivered ?? 0}.`);
    } catch (err: any) {
      setMessage(err?.message || 'Test failed.');
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100">
          {status === 'active' ? <Bell className="h-5 w-5 text-stone-700" /> : <BellOff className="h-5 w-5 text-stone-500" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-stone-900">Push notifications</p>
          <p className="mt-1 text-xs text-stone-600">
            {status === 'unsupported' && 'This browser does not support push notifications.'}
            {status === 'denied' && 'Blocked. Re-enable from your browser site settings.'}
            {status === 'loading' && 'Checking…'}
            {status === 'pending' && 'Working…'}
            {status === 'inactive' && 'Get instant alerts for new invoices, request updates and community votes.'}
            {status === 'active' && 'You are receiving push notifications on this device.'}
          </p>
          {message && <p className="mt-2 text-xs text-stone-500">{message}</p>}
        </div>
        <div className="shrink-0">
          {status === 'pending' || status === 'loading' ? (
            <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
          ) : status === 'active' ? (
            <button
              type="button"
              onClick={handleDisable}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Disable
            </button>
          ) : status === 'inactive' ? (
            <button
              type="button"
              onClick={handleEnable}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
            >
              Enable
            </button>
          ) : null}
        </div>
      </div>
      {showTest && status === 'active' && (
        <button
          type="button"
          onClick={handleTest}
          className="mt-3 w-full rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
        >
          Send test notification
        </button>
      )}
    </div>
  );
}
