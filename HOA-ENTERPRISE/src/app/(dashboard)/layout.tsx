'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { OrgSettingsProvider } from '@/providers/org-settings-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
          {/*
           * Single source of truth for page chrome: uniform p-6 across every
           * dashboard route. Pages render directly into this main (no per-page
           * max-w wrappers) so the content uses the full width of the viewport
           * minus the sidebar.
           */}
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </OrgSettingsProvider>
  );
}
