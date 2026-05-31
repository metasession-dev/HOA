/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  // Keep the freshly-installed worker in "waiting" until the user accepts the
  // in-app update prompt (see components/pwa-updater.tsx). The prompt posts
  // SKIP_WAITING (handled in custom-sw.js) to activate it on demand.
  skipWaiting: false,
  disable: process.env.NODE_ENV === 'development',
  importScripts: ['/custom-sw.js'],
  // Offline-first for static assets; network-first with a short fallback for
  // API GETs so admins still see their last-seen data when briefly offline
  // (POST/PUT/DELETE are never cached).
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
 * Security headers — applied to every response. Goals:
 *   - HSTS: enforce HTTPS once we've been visited.
 *   - X-Frame-Options DENY: kill clickjacking via iframe embedding.
 *   - X-Content-Type-Options nosniff: block MIME-sniffing attacks.
 *   - Referrer-Policy: never leak full URLs (with tokens / query params)
 *     to third-party origins.
 *   - Permissions-Policy: block sensors and capabilities we don't use.
 *   - Content-Security-Policy: limits where scripts, styles, images and
 *     network requests can originate. CSP is permissive enough to allow
 *     the configured API + observability hosts; tighten further when those
 *     are pinned in production.
 *
 * `connect-src` reads NEXT_PUBLIC_API_URL + observability hosts at build
 * time. Keeping it env-driven means no manual sync when the API moves.
 */
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
const residentsUrl = process.env.NEXT_PUBLIC_RESIDENTS_URL || 'http://localhost:3005';
const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL || '';
const sentryHost = 'https://*.sentry.io';
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const cspDirectives = [
  "default-src 'self'",
  // 'unsafe-inline' on style is needed for Next.js inline critical CSS +
  // Tailwind JIT. 'unsafe-eval' is required by Next.js dev tooling and
  // Sentry source maps; consider tightening (nonce-based) in prod.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${apiUrl} ${residentsUrl} ${marketingUrl} ${sentryHost} ${posthogHost}`.replace(/\s+/g, ' ').trim(),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // The enterprise PWA registers a service worker — allow worker scripts.
  "worker-src 'self' blob:",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Content-Security-Policy', value: cspDirectives },
];

const nextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

module.exports = withPWA(nextConfig);
