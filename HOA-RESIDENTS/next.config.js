/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  // Hold a freshly-installed worker in "waiting" so the in-app update banner
  // (components/pwa-updater.tsx) controls when it activates — accepting posts
  // SKIP_WAITING (handled in custom-sw.js) and the page reloads. Avoids the
  // jarring silent swap of skipWaiting:true.
  skipWaiting: false,
  disable: process.env.NODE_ENV === 'development',
  // Phase 10.1: inject our push handler into the generated service worker.
  importScripts: ['/custom-sw.js'],
  // Runtime cache strategies — offline-first for static assets, network-first
  // with short fallback for API GETs so residents still see their last-seen
  // data when offline (POSTs are never cached).
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/.*\/api\/(?!auth\/login|auth\/register).*$/,
      handler: 'NetworkFirst',
      method: 'GET',
      options: {
        cacheName: 'hoa-api',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'hoa-images',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      urlPattern: /\.(?:css|js|woff2?)$/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'hoa-static',
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
  ],
});

/**
 * Security headers — applied to every response (see HOA-ENTERPRISE's
 * next.config.js for the rationale; this is the resident-portal twin).
 * `connect-src` includes the API URL + observability hosts so push +
 * Sentry + PostHog work without CSP violations.
 */
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
const enterpriseUrl = process.env.NEXT_PUBLIC_ENTERPRISE_URL || 'http://localhost:3002';
const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL || '';
const sentryHost = 'https://*.sentry.io';
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${apiUrl} ${enterpriseUrl} ${marketingUrl} ${sentryHost} ${posthogHost}`.replace(/\s+/g, ' ').trim(),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // The resident PWA registers a service worker — allow worker scripts.
  "worker-src 'self' blob:",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
  { key: 'Content-Security-Policy', value: cspDirectives },
];

const nextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

module.exports = withPWA(nextConfig);
