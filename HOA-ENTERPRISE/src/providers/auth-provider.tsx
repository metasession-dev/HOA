'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Array<{
    role: string;
    roleName: string;
    organizationId: string;
    organizationName: string;
  }>;
}

/** Same privilege ordering the server uses on login — mirrored client-side
 *  so we can pick a sensible primary when nothing explicit was set (e.g. on
 *  a refresh that only restored `user.roles` from /auth/profile). */
const ROLE_PRIORITY: Record<string, number> = {
  super_admin: 0, hoa_admin: 10, exco_chairperson: 20, exco_member: 25,
  property_manager: 30, finance_officer: 40, external_accountant: 45,
  communications_manager: 50, gate_security: 60, stakeholder: 70,
  owner: 80, tenant: 90,
};
function rank(name: string) { return ROLE_PRIORITY[name] ?? 100; }

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  primaryRole: string;
  organizationId: string | null;
  organizationName: string;
  /** Swap to a different role this user already holds. Returns the new role
   *  so the caller can decide whether to cross-app redirect. */
  switchRole: (targetRole: string, targetOrganizationId?: string) => Promise<string>;
  /** Re-fetch /auth/profile and replace the cached user. Call after any
   *  mutation that changes display name, avatar, role assignments, or the
   *  org name (the role row carries `organizationName` in the response). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Persist the active role across reloads so /auth/profile (which returns
// roles[] but no "primary") doesn't lose our switch. Local-only — server
// doesn't track active role at all; the JWT already encodes it.
const PRIMARY_ROLE_KEY = 'hoa_active_role';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRole, setActiveRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Cross-app handoff: when the role switcher in the OTHER app sends the
      // user here, it includes the new JWT in the URL fragment so it never
      // hits the server log. We claim it, replace it into localStorage, then
      // strip the fragment so a refresh doesn't carry stale credentials.
      // Format: #token=<jwt>&role=<roleName>
      const hash = window.location.hash;
      if (hash.startsWith('#token=')) {
        const params = new URLSearchParams(hash.slice(1));
        const handoffToken = params.get('token');
        const handoffRole = params.get('role');
        if (handoffToken) {
          api.setToken(handoffToken);
          if (handoffRole) localStorage.setItem(PRIMARY_ROLE_KEY, handoffRole);
          // Clear the fragment so refresh or share-URL doesn't carry the token.
          window.history.replaceState(
            null,
            '',
            window.location.pathname + window.location.search,
          );
        }
      }
      setActiveRole(localStorage.getItem(PRIMARY_ROLE_KEY));
    }
    const stored = api.getToken();
    if (stored) {
      setToken(stored);
      api.get<any>('/auth/profile')
        .then((res) => setUser(res.data))
        .catch(() => { api.setToken(null); setToken(null); })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const persistActiveRole = (role: string | null) => {
    setActiveRole(role);
    try {
      if (role) localStorage.setItem(PRIMARY_ROLE_KEY, role);
      else localStorage.removeItem(PRIMARY_ROLE_KEY);
    } catch { /* ignore */ }
  };

  const login = async (email: string, password: string) => {
    // Tag the request with the originating app so the API can enforce the
    // enterpriseAccess gate. A user without enterpriseAccess can't sign
    // into the admin console even with valid credentials — the server
    // returns 403 and the message bubbles up via toast.
    const res: any = await api.post('/auth/login', { email, password, app: 'enterprise' });
    api.setToken(res.data.accessToken);
    setToken(res.data.accessToken);
    setUser(res.data.user);
    // Server sends primaryRole.name when it picked one; cache it locally.
    persistActiveRole(res.data.primaryRole?.name ?? res.data.user?.roles?.[0]?.role ?? null);
  };

  const register = async (data: any) => {
    const res: any = await api.post('/auth/register', data);
    api.setToken(res.data.accessToken);
    setToken(res.data.accessToken);
    setUser(res.data.user);
    persistActiveRole(res.data.primaryRole?.name ?? res.data.user?.roles?.[0]?.role ?? null);
  };

  const logout = () => {
    api.setToken(null);
    setToken(null);
    setUser(null);
    persistActiveRole(null);
    window.location.href = '/login';
  };

  const refreshUser = async () => {
    if (!api.getToken()) return;
    try {
      const res: any = await api.get('/auth/profile');
      setUser(res.data);
    } catch {
      // Swallow — a transient profile-fetch failure shouldn't surface an
      // error to the caller; their primary mutation already succeeded.
    }
  };

  const switchRole = async (targetRole: string, targetOrganizationId?: string) => {
    const res: any = await api.post('/auth/switch-role', {
      targetRole,
      targetOrganizationId,
    });
    api.setToken(res.data.accessToken);
    setToken(res.data.accessToken);
    setUser(res.data.user);
    const newRole = res.data.primaryRole?.name ?? targetRole;
    persistActiveRole(newRole);
    return newRole;
  };

  // Primary role resolution order:
  //   1. The role the user explicitly selected (stored client-side)
  //   2. Highest-privilege role they hold
  //   3. Owner as a safe default
  const primaryRole =
    (activeRole && user?.roles?.some((r) => r.role === activeRole) ? activeRole : null)
    ?? [...(user?.roles ?? [])].sort((a, b) => rank(a.role) - rank(b.role))[0]?.role
    ?? 'owner';
  const activeRoleEntry = user?.roles?.find((r) => r.role === primaryRole) ?? user?.roles?.[0];
  const organizationId = activeRoleEntry?.organizationId || null;
  const organizationName = activeRoleEntry?.organizationName || 'HOA.africa';

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, switchRole, refreshUser, primaryRole, organizationId, organizationName }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
