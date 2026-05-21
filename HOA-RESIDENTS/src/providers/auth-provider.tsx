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
  switchRole: (targetRole: string, targetOrganizationId?: string) => Promise<string>;
  /** Re-fetch /auth/profile and replace the cached user. Call after any
   *  mutation that changes display name, avatar, role assignments, or the
   *  organization name shown in the topbar. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const PRIMARY_ROLE_KEY = 'hoa_active_role';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRole, setActiveRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Cross-app handoff from the role switcher. See ENTERPRISE auth-provider
      // for the same logic + rationale (fragment-only, single-use, stripped).
      const hash = window.location.hash;
      if (hash.startsWith('#token=')) {
        const params = new URLSearchParams(hash.slice(1));
        const handoffToken = params.get('token');
        const handoffRole = params.get('role');
        if (handoffToken) {
          api.setToken(handoffToken);
          if (handoffRole) localStorage.setItem(PRIMARY_ROLE_KEY, handoffRole);
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
    // Tag the request with the originating app — the API only enforces the
    // enterpriseAccess gate on `app: 'enterprise'`, so residents land here
    // without it. Sent explicitly so the API can log the origin per session.
    const res: any = await api.post('/auth/login', { email, password, app: 'residents' });
    api.setToken(res.data.accessToken);
    setToken(res.data.accessToken);
    setUser(res.data.user);
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
      // Silent — the primary mutation already succeeded.
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
