import type { Request } from 'express';

/**
 * Phase 8.1 i18n: pick the locale the server should render emails / errors in.
 *
 * Resolution order (first match wins):
 *   1. Accept-Language header (q-weighted, supports `fr-CA`)
 *   2. User profile language (caller passes it in)
 *   3. Organization.language (caller passes it in)
 *   4. SUPPORTED[0] — English fallback
 *
 * We intentionally keep this lookup pure & dep-free; if we ever add ICU
 * formatting we'd reach for `@formatjs/intl` server-side.
 */
export const SUPPORTED = ['en', 'fr', 'pt', 'sw'] as const;
export type Locale = typeof SUPPORTED[number];

export function parseAcceptLanguage(header?: string | string[]): string[] {
  if (!header) return [];
  const raw = Array.isArray(header) ? header.join(',') : header;
  return raw
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';');
      const weight = q?.startsWith('q=') ? parseFloat(q.slice(2)) : 1.0;
      return { tag: tag.toLowerCase(), q: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((p) => p.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((p) => p.tag);
}

export function negotiateLocale(opts: {
  req?: Request;
  userLanguage?: string | null;
  orgLanguage?: string | null;
}): Locale {
  const supported = new Set<string>(SUPPORTED);

  const accepted = opts.req ? parseAcceptLanguage(opts.req.headers['accept-language']) : [];
  for (const tag of accepted) {
    const primary = tag.split('-')[0];
    if (supported.has(primary)) return primary as Locale;
  }
  if (opts.userLanguage && supported.has(opts.userLanguage)) return opts.userLanguage as Locale;
  if (opts.orgLanguage && supported.has(opts.orgLanguage)) return opts.orgLanguage as Locale;
  return 'en';
}
