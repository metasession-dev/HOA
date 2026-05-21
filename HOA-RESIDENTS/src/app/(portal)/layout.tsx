'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { OrgSettingsProvider } from '@/providers/org-settings-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { InstallBanner } from '@/components/install-banner';
import { OnboardingTour } from '@/components/onboarding-tour';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="font-display text-body text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <OrgSettingsProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          {/* Uniform p-6 across resident portal — matches admin app. */}
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
        <InstallBanner />
        <OnboardingTour />
      </div>
    </OrgSettingsProvider>
  );
}
