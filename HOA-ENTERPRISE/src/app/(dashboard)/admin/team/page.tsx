'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, UserPlus, ShieldCheck, ClipboardList, Search, MoreVertical, Clock, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';

export default function TeamMembersPage() {
  const confirm = useConfirm();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [includeResidents, setIncludeResidents] = useState(false);

  const load = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (includeResidents) params.set('includeResidents', 'true');
    setLoading(true);
    api.get<any>(`/team/members${params.toString() ? `?${params}` : ''}`).then((r) => setMembers(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [includeResidents]);

  const revokeRole = async (m: any, role: any) => {
    const ok = await confirm({
      title: `Revoke ${role.role.displayName}?`,
      description: `${m.firstName} ${m.lastName} will lose this role immediately.`,
      confirmText: 'Revoke',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/team/user-roles/${role.userRoleId}`);
      toast({ variant: 'success', title: 'Role revoked' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const deactivate = async (m: any) => {
    const ok = await confirm({
      title: `Deactivate ${m.firstName} ${m.lastName}?`,
      description: 'The user can no longer log in. All their role assignments remain on the record.',
      confirmText: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.post(`/team/users/${m.id}/deactivate`, {});
      toast({ variant: 'success', title: 'User deactivated' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Team</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Staff &amp; board members, role assignments, and login history. Looking for owners &amp; tenants?{' '}
            <Link href="/admin/people" className="text-ember-orange hover:underline">People</Link>.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/team/roles"><Button variant="secondary"><ShieldCheck className="mr-1.5 h-4 w-4" />Roles</Button></Link>
          <Link href="/admin/team/invites"><Button variant="secondary"><ClipboardList className="mr-1.5 h-4 w-4" />Invites</Button></Link>
          <Link href="/admin/team/invites/new"><Button><UserPlus className="mr-1.5 h-4 w-4" />Invite team member</Button></Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className="pl-8 h-9 w-72" />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <label className="flex items-center gap-2 text-caption text-muted-foreground ml-auto">
          <input type="checkbox" checked={includeResidents} onChange={(e) => setIncludeResidents(e.target.checked)} />
          Include residents (owner/tenant)
        </label>
      </div>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : members.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
              <Users className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No team members</p>
            <p className="text-caption text-muted-foreground">Invite the first finance officer or property manager.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-surface">
            {members.map((m) => (
              <div key={m.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-charcoal-primary font-medium">{m.firstName} {m.lastName}</p>
                      {!m.isActive && <Badge variant="muted">inactive</Badge>}
                    </div>
                    <p className="text-caption text-muted-foreground">{m.email} {m.lastLoginAt && `· last login ${formatDate(m.lastLoginAt)}`}</p>
                  </div>
                  {m.isActive && (
                    <Button size="sm" variant="ghost" onClick={() => deactivate(m)}>Deactivate</Button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.roles.map((r: any) => {
                    const expired = r.expiresAt && new Date(r.expiresAt) < new Date();
                    return (
                      <div key={r.userRoleId} className={cn('inline-flex items-center gap-2 rounded-lg bg-stone-surface/50 px-3 py-1.5', expired && 'opacity-60')}>
                        <span className="text-xs font-medium text-graphite">
                          {r.customRole ? r.customRole.displayName : r.role.displayName}
                        </span>
                        {r.expiresAt && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />{expired ? 'expired' : `expires ${formatDate(r.expiresAt)}`}
                          </span>
                        )}
                        {(r.unitIds?.length > 0 || r.estateIds?.length > 0) && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3" />{r.unitIds.length + r.estateIds.length} scoped
                          </span>
                        )}
                        {r.approvalLimit !== null && r.approvalLimit !== undefined && (
                          <span className="text-[11px] text-muted-foreground tabular-nums">≤ R {Number(r.approvalLimit).toLocaleString()}</span>
                        )}
                        <button onClick={() => revokeRole(m, r)} className="ml-1 text-coral-red/70 hover:text-coral-red text-[11px]">Revoke</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
