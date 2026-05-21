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
  reload: () => Promise<void>;
}>({ org: FALLBACK, reload: async () => {} });

export function OrgSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<OrgSettings>(FALLBACK);

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
    }
  };

  useEffect(() => {
    if (!user) {
      setOrg(FALLBACK);
      setOrgSettings({ currency: FALLBACK.currency, timezone: FALLBACK.timezone, language: FALLBACK.language });
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <OrgSettingsContext.Provider value={{ org, reload }}>
      {children}
    </OrgSettingsContext.Provider>
  );
}

export const useOrgSettings = () => useContext(OrgSettingsContext);
