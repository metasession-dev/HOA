'use client';

/**
 * Phase 10.2 — per-HOA branding. Reads `accentColor`, `logoUrl`, and
 * `brandingTagline` from /api/organizations/current and applies them as CSS
 * variables on the document root. Components that opt in (topbar, login,
 * onboarding) reference `var(--brand-accent)` and `var(--brand-logo)`.
 *
 * Falls back to the platform default when the org has no overrides set.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from './auth-provider';

interface Branding {
  logoUrl: string | null;
  accentColor: string | null;
  tagline: string | null;
  organizationName: string;
}

const DEFAULT_BRANDING: Branding = {
  logoUrl: null,
  accentColor: null,
  tagline: null,
  organizationName: 'HOA.africa',
};

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user, organizationName } = useAuth();
  const [branding, setBranding] = useState<Branding>({ ...DEFAULT_BRANDING, organizationName });

  useEffect(() => {
    if (!user) return;
    api
      .get<any>('/organizations/current')
      .then((res) => {
        const org = res?.data ?? res;
        setBranding({
          logoUrl: org.logoUrl ?? null,
          accentColor: org.accentColor ?? null,
          tagline: org.brandingTagline ?? null,
          organizationName: org.name ?? organizationName,
        });
      })
      .catch(() => {
        // Network blip; keep defaults.
      });
  }, [user, organizationName]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (branding.accentColor) {
      root.style.setProperty('--brand-accent', branding.accentColor);
    } else {
      root.style.removeProperty('--brand-accent');
    }
    if (branding.logoUrl) {
      root.style.setProperty('--brand-logo-url', `url("${branding.logoUrl.replace(/"/g, '\\"')}")`);
    } else {
      root.style.removeProperty('--brand-logo-url');
    }
  }, [branding]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);
