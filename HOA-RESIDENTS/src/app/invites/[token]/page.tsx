'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

export default function InviteRedeemPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token as string;
  const [invite, setInvite] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ password: '', confirmPassword: '', firstName: '', lastName: '' });

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    fetch(`${API_URL}/api/team/invites/public/${token}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || 'Invitation not available');
        return body.data;
      })
      .then((inv) => {
        setInvite(inv);
        setForm((f) => ({ ...f, firstName: inv.firstName || '', lastName: inv.lastName || '' }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) return toast({ variant: 'error', title: 'Password must be 8+ characters' });
    if (form.password !== form.confirmPassword) return toast({ variant: 'error', title: 'Passwords do not match' });
    if (!form.firstName.trim() || !form.lastName.trim()) return toast({ variant: 'error', title: 'Name required' });
    setBusy(true);
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    try {
      const r = await fetch(`${API_URL}/api/team/invites/public/redeem`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: form.password, firstName: form.firstName.trim(), lastName: form.lastName.trim() }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || 'Failed');
      toast({ variant: 'success', title: 'Account created', description: 'Sign in to continue.' });
      router.push('/login');
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="mx-auto max-w-md p-8"><Skeleton className="h-96" /></div>;

  if (error || !invite) {
    return (
      <div className="mx-auto max-w-md p-4 sm:p-8 mt-12">
        <Card><CardContent className="p-10 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-coral-red/10">
            <AlertTriangle className="h-5 w-5 text-coral-red" />
          </div>
          <h1 className="mt-3 font-display text-heading-sm text-charcoal-primary">Invitation unavailable</h1>
          <p className="mt-1 text-caption text-muted-foreground">{error || 'Link not found, expired, or already redeemed.'}</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-4 sm:p-8 space-y-6">
      <header className="text-center">
        {invite.organization?.logoUrl ? (
          <img src={invite.organization.logoUrl} alt="" className="mx-auto h-16 w-16 rounded-icon" />
        ) : (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-icon bg-midnight">
            <span className="font-display text-2xl text-white">{invite.organization?.name?.[0] || 'H'}</span>
          </div>
        )}
        <p className="mt-4 text-caption uppercase tracking-wider text-muted-foreground">You're invited to</p>
        <h1 className="font-display text-heading-md text-charcoal-primary">{invite.organization?.name}</h1>
        <p className="mt-2 text-body text-muted-foreground">
          <Mail className="inline h-4 w-4 mr-1" />
          {invite.email}
          {' · '}
          {invite.customRole ? invite.customRole.displayName : invite.roleName?.replace('_', ' ')}
        </p>
      </header>

      <form onSubmit={submit}>
        <Card><CardContent className="space-y-4 p-6">
          <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">Create your account</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>First name <span className="text-coral-red">*</span></Label><Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Last name <span className="text-coral-red">*</span></Label><Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Password <span className="text-coral-red">*</span></Label>
            <Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p className="text-caption text-muted-foreground">Minimum 8 characters.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Confirm password <span className="text-coral-red">*</span></Label>
            <Input type="password" required value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />{busy ? 'Creating…' : 'Accept & create account'}
          </Button>
          <p className="text-caption text-muted-foreground text-center">Expires {new Date(invite.expiresAt).toLocaleDateString()}</p>
        </CardContent></Card>
      </form>
    </div>
  );
}
