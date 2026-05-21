'use client';

import { LogOut } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/layout/notification-bell';
import { RoleSwitcher } from '@/components/layout/role-switcher';
import { getInitials } from '@/lib/utils';

export function Topbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-stone-surface bg-background px-5">
      <div className="flex items-center gap-2">
        <span className="font-display text-heading-sm text-charcoal-primary">HOA.africa</span>
        <span className="hidden text-caption text-muted-foreground sm:inline">Resident portal</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Role switcher: appears only when the user holds >1 active role.
            Switching to an admin/exco role hands the JWT to Enterprise via
            a URL fragment and navigates there. */}
        <RoleSwitcher />
        <NotificationBell />
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight text-charcoal-primary">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-caption text-muted-foreground">Resident</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ember-orange/15 text-[13px] font-medium text-ember-orange">
            {user ? getInitials(user.firstName, user.lastName) : 'U'}
          </div>
        </div>

        <Button variant="ghost" size="icon" onClick={logout} title="Log out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
