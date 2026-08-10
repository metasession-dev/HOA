/**
 * Canonical cross-app base URLs for the resident PWA.
 *
 * Anything that points at another surface of the platform — the API, the
 * admin console, the marketing site — resolves its origin here and nowhere
 * else. The mirror of this file lives at `HOA-ENTERPRISE/src/lib/app-urls.ts`;
 * the two differ only in which surface counts as "self".
 *
 * ## Why this file exists
 *
 * These origins used to be read inline at ~15 call sites, and the reads had
 * drifted apart — most visibly, `lib/api.ts` defaulted to port 3001 while the
 * API actually runs on 3003. Bugs of that shape are invisible in any
 * environment where the env var happens to be set, which is how they survive.
 * Centralising the reads means a wrong hostname has one place to hide.
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
export function residentsBaseUrl(): string {
  const configured = clean(RAW_RESIDENTS);
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return DEV.residents;
}

/** Origin of the admin console — e.g. `https://enterprise.hoa.africa`. */
export function enterpriseBaseUrl(): string {
  return clean(RAW_ENTERPRISE) || DEV.enterprise;
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
export function residentUrl(path?: string): string {
  return withPath(residentsBaseUrl(), path);
}

/** Absolute URL into the admin console. */
export function enterpriseUrl(path?: string): string {
  return withPath(enterpriseBaseUrl(), path);
}
