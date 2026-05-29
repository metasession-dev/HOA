'use client';

import Link from 'next/link';
import { LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/layout/notification-bell';
import { RoleSwitcher } from '@/components/layout/role-switcher';
import { getInitials } from '@/lib/utils';

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout, primaryRole } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-stone-surface bg-background px-4 sm:px-6">
      <div className="flex items-center gap-2">
        {/* Hamburger — opens the off-canvas nav on mobile; hidden on desktop
            where the sidebar is always visible. */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden -ml-1"
          onClick={onMenuClick}
          title="Menu"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-display text-heading-sm text-charcoal-primary">HOA.africa</span>
        <span className="hidden text-caption text-muted-foreground sm:inline">Enterprise console</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Role switcher: appears only when the user holds >1 active role.
            Clicking through to a resident role hands off the token to the
            resident PWA via URL fragment. */}
        <RoleSwitcher />
        <NotificationBell />
        {/* Clicking name/avatar goes to the account page — saves a click vs
            navigating into Settings → Profile. */}
        <Link
          href="/settings/profile"
          className="flex items-center gap-3 rounded-pill px-2 py-1 -mx-2 hover:bg-stone-surface transition-colors"
          title="Your account"
        >
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-charcoal-primary leading-tight">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-caption text-muted-foreground capitalize">
              {primaryRole.replace(/_/g, ' ')}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-surface text-[13px] font-medium text-graphite">
            {user ? getInitials(user.firstName, user.lastName) : 'U'}
          </div>
        </Link>

        <Button variant="ghost" size="icon" onClick={logout} title="Log out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
