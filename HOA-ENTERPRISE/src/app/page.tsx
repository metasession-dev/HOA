'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      router.replace(user ? '/admin' : '/login');
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center">
        <img src="/icons/logo.png" alt="HOA.africa" className="mx-auto h-16 w-16" />
        <p className="mt-4 font-display text-heading-sm text-charcoal-primary">HOA.africa</p>
        <p className="mt-1 text-caption text-muted-foreground">Loading your workspace…</p>
      </div>
    </div>
  );
}
