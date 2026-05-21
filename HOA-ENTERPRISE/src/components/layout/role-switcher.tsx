'use client';

/**
 * Topbar role switcher. Renders a chip like "Exco · Sunset HOA ⌄" when the
 * signed-in user holds >1 active role. Selecting another role:
 *   1. Calls /auth/switch-role to mint a fresh JWT for that role.
 *   2. Persists the new active-role choice locally.
 *   3. If the new role belongs to a different app (admin role while we're in
 *      the resident PWA, or vice versa), hands the JWT off to the other app
 *      via a URL fragment and navigates there. Otherwise just stays put.
 *
 * Apps:
 *   - Resident PWA hosts roles: owner, tenant
 *   - Enterprise console hosts everything else
 */
import * as React from 'react';
import { ChevronDown, KeyRound, Users, ShieldCheck, Briefcase, Coins, RadioTower, Building2, Check } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const RESIDENT_ROLES = new Set(['owner', 'tenant']);

function roleIcon(role: string) {
  if (role === 'owner') return KeyRound;
  if (role === 'tenant') return Users;
  if (role.startsWith('exco_')) return ShieldCheck;
  if (role === 'property_manager') return Briefcase;
  if (role.startsWith('finance_') || role === 'external_accountant') return Coins;
  if (role === 'communications_manager') return RadioTower;
  if (role === 'gate_security') return Building2;
  return Briefcase;
}

function shortLabel(roleName: string, fallback: string) {
  // Friendly short labels — fall back to the server's roleName if we don't
  // have a custom one.
  const map: Record<string, string> = {
    exco_member: 'Exco',
    exco_chairperson: 'Exco chair',
    hoa_admin: 'Admin',
    super_admin: 'Platform admin',
    property_manager: 'Manager',
    finance_officer: 'Finance',
    external_accountant: 'Accountant',
    communications_manager: 'Comms',
    gate_security: 'Gate',
    owner: 'Owner',
    tenant: 'Tenant',
    stakeholder: 'Stakeholder',
  };
  return map[roleName] || fallback;
}

export function RoleSwitcher() {
  const { user, primaryRole, organizationName, switchRole } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click — small touch but matches every other dropdown
  // in the app and avoids the "dropdown stuck open" annoyance.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const roles = user?.roles ?? [];
  if (roles.length < 2) return null;

  const activeEntry = roles.find((r) => r.role === primaryRole) ?? roles[0];
  const ActiveIcon = roleIcon(activeEntry.role);

  const handleSwitch = async (role: string, orgId: string) => {
    if (role === primaryRole && orgId === activeEntry.organizationId) {
      setOpen(false);
      return;
    }
    setBusy(role);
    try {
      const newRole = await switchRole(role, orgId);
      const targetsResidentApp = RESIDENT_ROLES.has(newRole);
      const inResidentApp = false; // this file lives in the Enterprise app

      if (targetsResidentApp !== inResidentApp) {
        // Cross-app: hand the token off via URL fragment so it never appears
        // in server logs, then navigate to the other app's root.
        const residentBase =
          process.env.NEXT_PUBLIC_RESIDENTS_URL || 'http://localhost:3005';
        const enterpriseBase =
          process.env.NEXT_PUBLIC_ENTERPRISE_URL || window.location.origin;
        const target = targetsResidentApp ? residentBase : enterpriseBase;
        const newToken = typeof window !== 'undefined' ? localStorage.getItem('hoa_token') : null;
        const url = `${target}/#token=${encodeURIComponent(newToken ?? '')}&role=${encodeURIComponent(newRole)}`;
        window.location.assign(url);
      } else {
        // Same app — just reload so RBAC-gated routes recompute against the
        // new JWT without trying to surgically refresh every page state.
        window.location.assign('/');
      }
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Could not switch role',
        description: err?.message || 'Try again, or contact support.',
      });
      setBusy(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-2 rounded-pill bg-stone-surface px-3 py-1.5 text-caption text-graphite transition-colors',
          'hover:bg-card hover:shadow-inset-stone',
          open && 'bg-card shadow-inset-stone',
        )}
      >
        <ActiveIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium text-charcoal-primary">
          {shortLabel(activeEntry.role, activeEntry.roleName)}
        </span>
        <span className="text-muted-foreground/80 max-w-[160px] truncate">
          · {organizationName}
        </span>
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 w-72 overflow-hidden rounded-lg border border-stone-surface bg-card shadow-soft"
        >
          <p className="px-3 pt-2.5 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Switch role
          </p>
          <ul className="py-1">
            {roles.map((r) => {
              const Icon = roleIcon(r.role);
              const isActive = r.role === primaryRole && r.organizationId === activeEntry.organizationId;
              const targetsResidentApp = RESIDENT_ROLES.has(r.role);
              return (
                <li key={`${r.role}-${r.organizationId}`}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleSwitch(r.role, r.organizationId)}
                    disabled={busy !== null}
                    className={cn(
                      'flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                      isActive ? 'bg-stone-surface/60' : 'hover:bg-stone-surface/40',
                      busy && 'opacity-60 cursor-wait',
                    )}
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-charcoal-primary truncate">
                        {r.roleName || shortLabel(r.role, r.role)}
                      </p>
                      <p className="text-caption text-muted-foreground truncate">
                        {r.organizationName}
                        {targetsResidentApp ? ' · resident app' : ' · admin console'}
                      </p>
                    </div>
                    {isActive && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-meadow-green" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-stone-surface px-3 py-2 text-[11px] text-muted-foreground">
            Switching to a resident role opens the resident portal.
          </p>
        </div>
      )}
    </div>
  );
}
