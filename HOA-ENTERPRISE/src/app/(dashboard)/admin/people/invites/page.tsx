'use client';

/**
 * Resident invitations — owners & tenants who sign into the resident app. This
 * is the People-domain counterpart to /admin/team/invites (staff). Both share
 * the same backend; this view is scoped to kind=resident.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Home, Filter, RotateCcw, X, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';

const statuses = ['all', 'pending', 'redeemed', 'expired', 'revoked'] as const;
const statusBadge: Record<string, 'muted' | 'info' | 'success' | 'destructive' | 'warning'> = {
  pending: 'warning', redeemed: 'success', expired: 'muted', revoked: 'destructive',
};
const residentsBase = () => process.env.NEXT_PUBLIC_RESIDENTS_URL || process.env.NEXT_PUBLIC_RESIDENT_URL || 'http://localhost:3005';

export default function ResidentInvitesListPage() {
  const confirm = useConfirm();
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<typeof statuses[number]>('pending');

  const load = () => {
    const params = new URLSearchParams();
    params.set('kind', 'resident');
    if (status !== 'all') params.set('status', status);
    setLoading(true);
    api.get<any>(`/team/invites?${params}`).then((r) => setInvites(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  const revoke = async (inv: any) => {
    const ok = await confirm({
      title: `Revoke invite for ${inv.email}?`,
      description: 'The token becomes unusable immediately.',
      confirmText: 'Revoke',
      destructive: true,
    });
    if (!ok) return;
    try {
      const idemp = `invite-revoke-${inv.id}-${Math.floor(Date.now() / 30_000)}`;
      await api.post(`/team/invites/${inv.id}/revoke`, {}, idemp);
      toast({ variant: 'success', title: 'Invite revoked' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const resend = async (inv: any) => {
    try {
      const idemp = `invite-resend-${inv.id}-${Math.floor(Date.now() / 30_000)}`;
      const r = await api.post<any>(`/team/invites/${inv.id}/resend`, {}, idemp);
      try { await navigator.clipboard.writeText(`${residentsBase()}/invites/${r.data.token}`); } catch { /* ignore */ }
      toast({ variant: 'success', title: 'Invite rotated', description: 'New link copied to clipboard · email queued' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const copyLink = (inv: any) => {
    navigator.clipboard.writeText(`${residentsBase()}/invites/${inv.token}`);
    toast({ variant: 'success', title: 'Link copied' });
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/people" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />People
      </Link>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Resident invites</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Owners &amp; tenants who sign into the resident app. Inviting staff instead?{' '}
            <Link href="/admin/team/invites" className="text-ember-orange hover:underline">Invite a team member</Link>.
          </p>
        </div>
        <Link href="/admin/people/invites/new"><Button><Home className="mr-1.5 h-4 w-4" />Invite resident</Button></Link>
      </header>

      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {statuses.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={cn('rounded-pill px-3 py-1 text-caption font-medium transition-colors capitalize',
              status === s ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone')}>
            {s}
          </button>
        ))}
      </div>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : invites.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-body text-charcoal-primary font-medium">No resident invitations in this view</p>
            <p className="text-caption text-muted-foreground">
              <Link href="/admin/people/invites/new" className="text-ember-orange hover:underline">Invite a resident</Link> to give them access to their invoices and gate passes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Resident</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Sent</th>
                  <th className="px-6 py-3">Expires</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv, i) => (
                  <tr key={inv.id} className={i !== invites.length - 1 ? 'border-b border-stone-surface' : ''}>
                    <td className="px-6 py-3 text-graphite">
                      <p className="font-medium">{inv.email}</p>
                      {(inv.firstName || inv.lastName) && <p className="text-caption text-muted-foreground">{inv.firstName} {inv.lastName}</p>}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={inv.roleName === 'tenant' ? 'info' : 'success'}>{inv.roleName || 'owner'}</Badge>
                      {inv.enterpriseAccess && <Badge variant="muted" className="ml-1.5">+ admin</Badge>}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{formatDate(inv.createdAt)}</td>
                    <td className="px-6 py-3 text-muted-foreground">{formatDate(inv.tokenExpiresAt)}</td>
                    <td className="px-6 py-3"><Badge variant={statusBadge[inv.status] || 'muted'}>{inv.status}</Badge></td>
                    <td className="px-6 py-3 text-right">
                      {inv.status === 'pending' && (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => copyLink(inv)} className="rounded-pill p-1.5 text-muted-foreground hover:text-graphite hover:bg-stone-surface" title="Copy link"><Copy className="h-3.5 w-3.5" /></button>
                          <button onClick={() => resend(inv)} className="rounded-pill p-1.5 text-muted-foreground hover:text-graphite hover:bg-stone-surface" title="Rotate & resend"><RotateCcw className="h-3.5 w-3.5" /></button>
                          <button onClick={() => revoke(inv)} className="rounded-pill p-1.5 text-coral-red/70 hover:text-coral-red hover:bg-stone-surface" title="Revoke"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
