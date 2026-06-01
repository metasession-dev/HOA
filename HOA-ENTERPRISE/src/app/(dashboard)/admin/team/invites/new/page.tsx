'use client';

/**
 * Team-member invitation — staff who'll log into the admin console (property
 * managers, finance officers, exco, gate security, etc.). Picks a system role
 * (excluding owner/tenant) or a custom role.
 *
 * Residents are invited from a separate page (/admin/team/invites/resident) so
 * the two flows stay distinct and uncluttered.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Briefcase, Home } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

// Roles available to team-member invites. Excludes owner/tenant (those go
// through the resident flow) and super_admin (platform-level, not org-scoped).
const TEAM_ROLES = [
  'hoa_admin', 'property_manager', 'finance_officer',
  'exco_member', 'exco_chairperson', 'communications_manager',
  'gate_security', 'maintenance_coordinator', 'external_accountant',
] as const;

const selectClass = 'flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

export default function NewTeamInvitePage() {
  const router = useRouter();
  const [customRoles, setCustomRoles] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState({
    email: '', firstName: '', lastName: '',
    roleType: 'system' as 'system' | 'custom',
    roleName: 'property_manager' as string,
    customRoleId: '',
    expiresAt: '',
    approvalLimit: '',
  });

  useEffect(() => {
    api.get<any>('/team/custom-roles').then((r) => setCustomRoles(r.data || [])).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (!team.email.trim()) throw new Error('Email is required');
      const idemp = `invite-${team.email.trim().toLowerCase()}-${Date.now()}`;
      const payload = {
        kind: 'team_member',
        email: team.email.trim().toLowerCase(),
        firstName: team.firstName || undefined,
        lastName: team.lastName || undefined,
        ...(team.roleType === 'system' ? { roleName: team.roleName } : { customRoleId: team.customRoleId }),
        ...(team.expiresAt ? { expiresAt: new Date(team.expiresAt).toISOString() } : {}),
        ...(team.approvalLimit ? { approvalLimit: Number(team.approvalLimit) } : {}),
      };
      const r = await api.post<any>('/team/invites', payload, idemp);
      const url = `${process.env.NEXT_PUBLIC_RESIDENTS_URL || 'http://localhost:3005'}/invites/${r.data.token}`;
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      toast({ variant: 'success', title: 'Invitation created', description: 'Link copied to clipboard' });
      router.push('/admin/team/invites');
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/team/invites" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Invites
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary inline-flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-graphite" />Invite team member
          </h1>
          <p className="mt-1 text-body text-muted-foreground">
            Staff who sign into the admin console. Inviting an owner or tenant instead?{' '}
            <Link href="/admin/people/invites/new" className="text-ember-orange hover:underline inline-flex items-center gap-1">
              <Home className="h-3.5 w-3.5" />Invite a resident
            </Link>.
          </p>
        </div>
      </header>

      <form onSubmit={submit}>
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label>Email <span className="text-coral-red">*</span></Label>
              <Input type="email" required value={team.email}
                onChange={(e) => setTeam({ ...team, email: e.target.value })} placeholder="finance@acme-hoa.co.za" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={team.firstName} onChange={(e) => setTeam({ ...team, firstName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={team.lastName} onChange={(e) => setTeam({ ...team, lastName: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Role type</Label>
              <div className="flex gap-2">
                {(['system', 'custom'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTeam({ ...team, roleType: t })}
                    className={cn('rounded-pill px-3 py-1 text-caption font-medium transition-colors',
                      t === team.roleType ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card')}>
                    {t === 'system' ? 'System role' : 'Custom role'}
                  </button>
                ))}
              </div>
            </div>

            {team.roleType === 'system' ? (
              <div className="space-y-1.5">
                <Label>Role <span className="text-coral-red">*</span></Label>
                <select required value={team.roleName} onChange={(e) => setTeam({ ...team, roleName: e.target.value })} className={selectClass}>
                  {TEAM_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Custom role <span className="text-coral-red">*</span></Label>
                <select required value={team.customRoleId} onChange={(e) => setTeam({ ...team, customRoleId: e.target.value })} className={selectClass}>
                  <option value="">— select —</option>
                  {customRoles.map((r) => <option key={r.id} value={r.id}>{r.displayName}</option>)}
                </select>
                {customRoles.length === 0 && (
                  <p className="text-caption text-muted-foreground">
                    No custom roles yet. <Link href="/admin/team/roles" className="text-ember-orange hover:underline">Create one</Link>.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Expires (time-bound role)</Label>
                <Input type="date" value={team.expiresAt} onChange={(e) => setTeam({ ...team, expiresAt: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Approval limit</Label>
                <Input type="number" min={0} step={0.01} value={team.approvalLimit}
                  onChange={(e) => setTeam({ ...team, approvalLimit: e.target.value })} placeholder="optional" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-surface">
              <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" loading={busy}>{busy ? 'Creating…' : 'Send invitation'}</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
