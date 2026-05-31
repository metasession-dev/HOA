'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { OrgSettingsProvider } from '@/providers/org-settings-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomNav } from '@/components/layout/bottom-nav';
import { Topbar } from '@/components/layout/topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, primaryRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Mobile off-canvas nav state. Closes automatically on route change.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  // Keep narrowly-scoped personas in their lane (the API enforces this too):
  //   • vendors only ever see /vendor/*
  //   • gate_security is locked to the gate screen
  useEffect(() => {
    if (isLoading || !user) return;
    if (primaryRole === 'vendor' && !pathname.startsWith('/vendor')) {
      router.replace('/vendor/invoices');
    } else if (primaryRole === 'gate_security' && !pathname.startsWith('/gate')) {
      router.replace('/gate');
    }
  }, [primaryRole, pathname, isLoading, user, router]);

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
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar onMenuClick={() => setMobileNavOpen(true)} />
          {/*
           * Single source of truth for page chrome: uniform p-6 across every
           * dashboard route. Pages render directly into this main (no per-page
           * max-w wrappers) so the content uses the full width of the viewport
           * minus the sidebar.
           */}
          <main className="flex-1 overflow-y-auto p-6 pb-24 lg:pb-6">{children}</main>
        </div>
        <BottomNav onMore={() => setMobileNavOpen(true)} />
      </div>
    </OrgSettingsProvider>
  );
}
