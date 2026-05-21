'use client';

/**
 * Sentry + PostHog initialiser for the admin app.
 *
 * - Sentry: page-load + JS errors, with sourcemaps when SENTRY_RELEASE is set.
 * - PostHog: pageviews, user identity tied to the authed User.
 *
 * All env vars are NEXT_PUBLIC_* so they survive Next's client bundle.
 * Either subsystem is a no-op when its key is absent — keeps dev quiet.
 */
import { useEffect } from 'react';
import * as Sentry from '@sentry/browser';
import posthog from 'posthog-js';
import { useAuth } from './auth-provider';

let initialised = false;

function initOnce() {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;

  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,
      release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
  }

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      // Admin app — keep session recording off; admins audit shared screens.
      disable_session_recording: true,
      persistence: 'localStorage+cookie',
    });
  }
}

export function ObservabilityProvider({ children }: { children: React.ReactNode }) {
  const { user, primaryRole, organizationId, organizationName } = useAuth();

  useEffect(() => {
    initOnce();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.setUser({ id: user.id, email: user.email });
      Sentry.setTag('role', primaryRole);
      if (organizationId) Sentry.setTag('organizationId', organizationId);
    }
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.identify(user.id, {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: primaryRole,
      });
      if (organizationId) {
        posthog.group('organization', organizationId, { name: organizationName });
      }
    }
  }, [user, primaryRole, organizationId, organizationName]);

  return <>{children}</>;
}

/** Imperative helpers for components that want to emit custom events. */
export function trackEvent(event: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture(event, props);
}

export function reportError(err: unknown, context?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (context) for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
    Sentry.captureException(err);
  });
}
