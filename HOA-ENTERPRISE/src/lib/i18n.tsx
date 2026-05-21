'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import en from '@/locales/en.json';
import fr from '@/locales/fr.json';
import pt from '@/locales/pt.json';
import sw from '@/locales/sw.json';

/**
 * Lightweight i18n: no extra deps, just a dictionary + dot-path lookup. We
 * negotiate the locale from (in order): user preference in localStorage,
 * organization.language, the browser navigator.language. SSR-safe — the
 * provider hydrates the active locale on mount; until then English renders.
 *
 * When we outgrow this — pluralization, ICU MessageFormat, namespaces — drop
 * in next-intl or i18next using the same Provider shape so callers don't
 * change.
 */

export type Locale = 'en' | 'fr' | 'pt' | 'sw';

const DICTIONARIES: Record<Locale, any> = { en, fr, pt, sw };

const STORAGE_KEY = 'hoa.locale';

type I18nCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (path: string, fallback?: string) => string;
};

const Ctx = createContext<I18nCtx>({
  locale: 'en',
  setLocale: () => {},
  t: (path, fallback) => fallback ?? path,
});

function pickInitialLocale(orgLanguage?: string): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in DICTIONARIES) return stored as Locale;
  } catch { /* no-op */ }
  if (orgLanguage && orgLanguage in DICTIONARIES) return orgLanguage as Locale;
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return browser in DICTIONARIES ? (browser as Locale) : 'en';
}

function lookup(dict: any, path: string): string | undefined {
  // Review #18: own-properties only — `in` walks the prototype chain so a key
  // like "constructor.name" would yield "Object".
  const parts = path.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, p)) {
      cur = cur[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function I18nProvider({
  children,
  orgLanguage,
}: { children: React.ReactNode; orgLanguage?: string }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    setLocaleState(pickInitialLocale(orgLanguage));
  }, [orgLanguage]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* no-op */ }
    // Send Accept-Language hint on subsequent API calls via cookie so the
    // server can localize emails too. Lightweight: no provider plumbing.
    try { document.cookie = `hoa_locale=${l}; path=/; max-age=${365 * 86400}; SameSite=Lax`; } catch { /* no-op */ }
  };

  const t = useMemo(
    () => (path: string, fallback?: string): string => {
      const dict = DICTIONARIES[locale];
      const fromActive = lookup(dict, path);
      if (fromActive !== undefined) return fromActive;
      // English fallback
      const fromEn = lookup(DICTIONARIES.en, path);
      return fromEn ?? fallback ?? path;
    },
    [locale],
  );

  const value: I18nCtx = useMemo(() => ({ locale, setLocale, t }), [locale, t]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}

export function useT() {
  return useContext(Ctx).t;
}
