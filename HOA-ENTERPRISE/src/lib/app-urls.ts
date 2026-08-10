/**
 * Canonical cross-app base URLs for the admin console.
 *
 * Anything that points at another surface of the platform — the API, the
 * resident PWA, the marketing site — resolves its origin here and nowhere
 * else. The mirror of this file lives at `HOA-RESIDENTS/src/lib/app-urls.ts`;
 * the two differ only in which surface counts as "self".
 *
 * ## Why this file exists
 *
 * These origins used to be read inline at ~20 call sites, and the reads had
 * drifted apart:
 *
 *   • Two different variable names were live at once —
 *     `NEXT_PUBLIC_RESIDENTS_URL` (plural, the one actually set on Railway)
 *     and `NEXT_PUBLIC_RESIDENT_URL` (singular, set nowhere). Call sites
 *     reading the singular silently fell through to their localhost default,
 *     so "copy invite link" in production handed admins a `localhost:3005`
 *     URL that could never work for the recipient.
 *   • `lib/api.ts` defaulted to port 3001; the API actually runs on 3003.
 *
 * Both bugs are invisible in any environment where the env var happens to be
 * set, which is why they survived. Centralising the reads means a wrong
 * hostname now has exactly one place to hide.
 *
 * ## Next.js inlining — read before editing
 *
 * Every `process.env.NEXT_PUBLIC_*` below is written out as a complete,
 * literal member expression on purpose. Next.js substitutes that exact text
 * at build time; it does not ship a populated `process.env` to the browser.
 * A computed read (`process.env[name]`, destructuring, a helper taking the
 * name as an argument) is therefore NOT substituted, survives into the client
 * bundle as a property access on an object that isn't there, and silently
 * evaluates to `undefined`. Keep the reads literal and eager.
 */

/**
 * Local dev ports. MUST match the `--port` flags in each app's package.json
 * and the values in the `.env.example` files.
 */
const DEV = {
  api: 'http://localhost:3003',
  enterprise: 'http://localhost:3002',
  residents: 'http://localhost:3005',
} as const;

// Literal, build-time-substituted reads. See the inlining note above.
const RAW_API = process.env.NEXT_PUBLIC_API_URL;
const RAW_ENTERPRISE = process.env.NEXT_PUBLIC_ENTERPRISE_URL;
const RAW_RESIDENTS = process.env.NEXT_PUBLIC_RESIDENTS_URL;
const RAW_MARKETING = process.env.NEXT_PUBLIC_MARKETING_URL;

/**
 * Trailing slashes are stripped so callers can always pass a leading-slash
 * path without producing a double slash. An operator pasting
 * `https://resident.hoa.africa/` into Railway must not corrupt every link.
 */
function clean(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '');
}

function withPath(base: string, path = ''): string {
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Origin of the API — e.g. `https://api.hoa.africa`. No `/api` suffix: the
 *  api client in `lib/api.ts` prepends `/api` to every path itself. */
export function apiBaseUrl(): string {
  return clean(RAW_API) || DEV.api;
}

/**
 * Origin of this app. Falls back to the current origin in the browser, which
 * is always right for self-references and means a preview deployment doesn't
 * bounce users back to production.
 */
export function enterpriseBaseUrl(): string {
  const configured = clean(RAW_ENTERPRISE);
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return DEV.enterprise;
}

/** Origin of the resident PWA — e.g. `https://resident.hoa.africa`. */
export function residentsBaseUrl(): string {
  return clean(RAW_RESIDENTS) || DEV.residents;
}

/**
 * Origin of the marketing site, or `''` when unset. Callers treat the empty
 * string as "hide the link" rather than rendering a dead one, so there is
 * deliberately no localhost default here.
 */
export function marketingBaseUrl(): string {
  return clean(RAW_MARKETING);
}

/** Absolute URL into the API, e.g. `apiUrl('/api/files/123')`. */
export function apiUrl(path?: string): string {
  return withPath(apiBaseUrl(), path);
}

/** Absolute URL into this app. */
export function enterpriseUrl(path?: string): string {
  return withPath(enterpriseBaseUrl(), path);
}

/** Absolute URL into the resident PWA, e.g. `residentUrl('/invites/abc')`. */
export function residentUrl(path?: string): string {
  return withPath(residentsBaseUrl(), path);
}

/**
 * The link an admin copies to hand an invitation over out-of-band. Redemption
 * happens in the resident PWA for every invite kind — team, resident and
 * vendor alike — which is easy to forget when reading a call site in the
 * admin console, so it gets its own named helper.
 */
export function inviteRedeemUrl(token: string): string {
  return residentUrl(`/invites/${token}`);
}
