/** @type {import('next').NextConfig} */

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

module.exports = nextConfig;
