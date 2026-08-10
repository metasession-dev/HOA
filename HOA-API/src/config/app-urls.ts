/**
 * Canonical base URLs for every externally-visible surface of the platform.
 *
 * Every link the API puts in front of a human — invitation emails, password
 * resets, magic links, invoice reminders, vote and survey links, gate-pass
 * QR targets, opt-out footers — resolves its origin here and nowhere else.
 *
 * ## Why this file exists
 *
 * Link building used to be inlined at ~20 call sites, each carrying its own
 * chain of environment-variable aliases and its own hardcoded localhost
 * fallback. Two classes of bug grew out of that:
 *
 *   1. **Aliases drifted.** `APP_RESIDENTS_URL`, `RESIDENT_BASE_URL` and
 *      `RESIDENTS_BASE_URL` were all live at once, in different orders, at
 *      different call sites. When they disagreed, the hostname in an email
 *      depended on which service happened to build the link — so a stale
 *      value could sit in production breaking only some links.
 *   2. **Fallbacks were wrong, and wrong in opposite directions.** The
 *      resident fallback was `http://localhost:3002` and the enterprise
 *      fallback `http://localhost:3005` — exactly backwards. Enterprise runs
 *      on 3002 and residents on 3005 (see each app's `package.json` dev
 *      script and `.env.example`). Locally, with the env vars unset, every
 *      resident link pointed at the admin console and vice versa.
 *
 * ## The rule
 *
 * Do not read a base-URL environment variable anywhere else in this codebase.
 * Import `residentUrl` / `enterpriseUrl` / `apiUrl` and build the path. If you
 * need a new surface, add it here.
 *
 * Resolution is deliberately done per call rather than at module load. Module
 * scope evaluates on first import, which for some Nest providers happens
 * before `dotenv` has populated `process.env`; reading lazily removes that
 * ordering hazard entirely and costs nothing measurable.
 */

/**
 * Local dev ports, kept in one place so the fallbacks can never drift from
 * reality again. These MUST match the `--port` flags in each app's
 * package.json dev/start scripts and the values in HOA-API/.env.example.
 */
const DEV_PORTS = {
  api: 3003,
  enterprise: 3002,
  residents: 3005,
} as const;

/**
 * Environment-variable alias chains, highest precedence first.
 *
 * The `APP_*_URL` names are canonical — those are what `scripts/setup-railway.*`
 * writes and what RAILWAY_DEPLOY.md documents. The rest are legacy names still
 * present on some deployed environments; they are read so that an older
 * environment keeps working, but nothing should be setting them going forward.
 */
const ENV_ALIASES = {
  api: ['API_PUBLIC_URL', 'PUBLIC_API_URL'],
  enterprise: ['APP_ENTERPRISE_URL', 'ENTERPRISE_BASE_URL', 'APP_BASE_URL'],
  residents: ['APP_RESIDENTS_URL', 'RESIDENT_BASE_URL', 'RESIDENTS_BASE_URL'],
} as const;

/**
 * Strips trailing slashes and surrounding whitespace so that callers can
 * always join with a leading-slash path without producing a double slash.
 * An operator pasting `https://resident.hoa.africa/` into Railway is a
 * completely reasonable thing to do and must not corrupt every link.
 */
function normalizeBase(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/** First alias that is set to something non-empty, else undefined. */
function fromEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return normalizeBase(value);
  }
  return undefined;
}

function resolve(surface: keyof typeof ENV_ALIASES): string {
  const explicit = fromEnv(ENV_ALIASES[surface]);
  if (explicit) return explicit;

  // Railway injects RAILWAY_PUBLIC_DOMAIN into every service with the domain
  // actually attached to it — the custom domain once one is bound, otherwise
  // the *.up.railway.app default. For our own origin that is strictly better
  // than a localhost guess, and it is self-healing: it cannot go stale the way
  // a hand-typed hostname can. It only describes THIS service, so it is no
  // help for the two front-ends.
  if (surface === 'api' && process.env.RAILWAY_PUBLIC_DOMAIN) {
    return normalizeBase(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }

  return `http://localhost:${DEV_PORTS[surface]}`;
}

/** Origin of the resident PWA — e.g. `https://resident.hoa.africa`. */
export function residentsBaseUrl(): string {
  return resolve('residents');
}

/** Origin of the admin console — e.g. `https://enterprise.hoa.africa`. */
export function enterpriseBaseUrl(): string {
  return resolve('enterprise');
}

/** Origin of this API — e.g. `https://api.hoa.africa`. No `/api` suffix. */
export function apiBaseUrl(): string {
  return resolve('api');
}

/**
 * Joins a path onto a base. Accepts paths with or without a leading slash so
 * call sites don't have to care, and passes through an already-absolute URL
 * untouched — handy where a caller may or may not have an override in hand.
 */
function withPath(base: string, path = ''): string {
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Absolute URL into the resident PWA, e.g. `residentUrl('/invites/abc')`. */
export function residentUrl(path?: string): string {
  return withPath(residentsBaseUrl(), path);
}

/** Absolute URL into the admin console, e.g. `enterpriseUrl('/login')`. */
export function enterpriseUrl(path?: string): string {
  return withPath(enterpriseBaseUrl(), path);
}

/** Absolute URL into this API, e.g. `apiUrl('/api/files/123')`. */
export function apiUrl(path?: string): string {
  return withPath(apiBaseUrl(), path);
}

/**
 * Comma-joined origins to allow through CORS when `CORS_ORIGIN` is unset.
 * Deliberately dev-only in spirit: in production `CORS_ORIGIN` is always set
 * by `scripts/setup-railway.*`, and if it somehow isn't, falling back to
 * localhost fails closed rather than opening the API to a guessed origin.
 */
export function defaultDevCorsOrigins(): string {
  return [enterpriseBaseUrl(), residentsBaseUrl()].join(',');
}

/** Which front-end app a link should target. */
export type AppSurface = 'residents' | 'enterprise';

/**
 * Base URL for a surface chosen at runtime — for flows like password reset
 * that pick the app from the request rather than from the call site.
 */
export function baseUrlForApp(app: AppSurface): string {
  return app === 'residents' ? residentsBaseUrl() : enterpriseBaseUrl();
}

/** Absolute URL into a surface chosen at runtime. */
export function urlForApp(app: AppSurface, path?: string): string {
  return withPath(baseUrlForApp(app), path);
}
