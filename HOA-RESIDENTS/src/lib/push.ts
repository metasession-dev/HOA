/**
 * Phase 10.1 — Web Push client helpers.
 *
 * Subscribing involves:
 *   1. Service worker is registered (next-pwa does this on production builds).
 *   2. Fetch the server's VAPID public key.
 *   3. `pushManager.subscribe()` with that key — browser asks for permission.
 *   4. POST the resulting endpoint + keys to the API so it can dispatch later.
 *
 * Unsubscribing reverses all that — both client and server need to know.
 */
import { api } from './api';

export type PushSupport = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
};

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') return { supported: false, permission: 'unsupported' };
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return { supported, permission: supported ? Notification.permission : 'unsupported' };
}

/** Returns the active subscription registered with this browser, or null. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Subscribe this browser to push and tell the API about it. Idempotent — if
 * the user already has an active subscription this fast-paths.
 */
export async function subscribeToPush(): Promise<{ subscribed: boolean; reason?: string }> {
  const support = getPushSupport();
  if (!support.supported) return { subscribed: false, reason: 'unsupported' };

  // Ask for permission first — Chrome / Safari require an explicit grant.
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { subscribed: false, reason: 'denied' };
  } else if (Notification.permission === 'denied') {
    return { subscribed: false, reason: 'denied' };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyRes: any = await api.get('/notifications/push/vapid-public-key');
    const publicKey = keyRes?.data?.publicKey;
    if (!publicKey) return { subscribed: false, reason: 'server-disabled' };
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // PushManager wants `BufferSource`; the Uint8Array view's buffer satisfies it.
      applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
    });
  }

  // Always sync to the server — re-subscribes shake out any drift between
  // browser and DB (e.g., the user re-granted permission after revoking).
  const payload = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    return { subscribed: false, reason: 'bad-subscription' };
  }
  await api.post('/notifications/push/subscribe', {
    endpoint: payload.endpoint,
    p256dh: payload.keys.p256dh,
    auth: payload.keys.auth,
    userAgent: navigator.userAgent,
  });
  return { subscribed: true };
}

/** Drop the local subscription. Also asks the server to forget it. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  // Server-side revoke is per-subscription-id, not endpoint — list our subs
  // and revoke the matching one.
  try {
    const list: any = await api.get('/notifications/push');
    const mine = (list?.data || []).find((s: { endpoint: string }) => s.endpoint === endpoint);
    if (mine) await api.delete(`/notifications/push/${mine.id}`);
  } catch (_) {
    // Best-effort; the next dispatch will 404 anyway and the server will
    // auto-revoke.
  }
}

/** VAPID public keys are base64url; PushManager wants Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
