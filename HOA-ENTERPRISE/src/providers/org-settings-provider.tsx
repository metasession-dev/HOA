'use client';

/**
 * Org-wide settings (currency, timezone, language, branding) loaded once on
 * login and pushed into the module-level cache in `@/lib/utils` so legacy
 * `formatCurrency(amount)` / `formatDate(iso)` callers automatically render
 * in the org's currency + timezone — no per-component prop threading.
 *
 * Components that need reactive access can use `useOrgSettings()` directly.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/api';
import { setOrgSettings } from '@/lib/utils';
import { useAuth } from './auth-provider';

interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  timezone: string;
  language: string;
  logoUrl: string | null;
  accentColor: string | null;
  brandingTagline: string | null;
}

const FALLBACK: OrgSettings = {
  id: '', name: 'HOA.africa', slug: '',
  country: 'ZA', currency: 'ZAR', timezone: 'Africa/Johannesburg', language: 'en',
  logoUrl: null, accentColor: null, brandingTagline: null,
};

const OrgSettingsContext = createContext<{
  org: OrgSettings;
  loaded: boolean;
  reload: () => Promise<void>;
}>({ org: FALLBACK, loaded: false, reload: async () => {} });

export function OrgSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<OrgSettings>(FALLBACK);
  // Gate currency-bearing UI until the org's real currency is known, so
  // amounts never flash the ZAR ("R") fallback before settings load.
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    try {
      const res = await api.get<any>('/organizations/current');
      const next: OrgSettings = { ...FALLBACK, ...(res?.data ?? res) };
      setOrg(next);
      setOrgSettings({
        currency: next.currency,
        timezone: next.timezone,
        language: next.language,
      });
    } catch {
      // Keep the fallback so the UI still renders consistent placeholders.
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (!user) {
      setOrg(FALLBACK);
      setOrgSettings({ currency: FALLBACK.currency, timezone: FALLBACK.timezone, language: FALLBACK.language });
      setLoaded(true);
      return;
    }
    setLoaded(false);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // While a signed-in user's org settings load, show a brief loader instead of
  // rendering amounts in the placeholder currency.
  if (user && !loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="font-display text-body text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <OrgSettingsContext.Provider value={{ org, loaded, reload }}>
      {children}
    </OrgSettingsContext.Provider>
  );
}

export const useOrgSettings = () => useContext(OrgSettingsContext);
