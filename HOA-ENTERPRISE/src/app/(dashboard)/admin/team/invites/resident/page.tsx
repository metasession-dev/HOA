'use client';

/**
 * Resident invitation — owners and tenants who'll log into the resident PWA.
 * The admin picks an existing Person from the directory; the invite binds via
 * `personId` so redemption sets Person.userId without creating a duplicate.
 *
 * Team members are invited from a separate page (/admin/team/invites/new).
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Home, Briefcase, Search, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const selectClass = 'flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

export default function NewResidentInvitePage() {
  const router = useRouter();
  const [people, setPeople] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [resident, setResident] = useState({
    personId: '',
    roleName: 'owner' as 'owner' | 'tenant',
    email: '', firstName: '', lastName: '', phone: '',
    enterpriseAccess: false,
  });

  useEffect(() => {
    api.get<any>('/people?limit=500').then((r) => setPeople(r.data || [])).catch(() => {});
  }, []);

  const filteredPeople = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.firstName, p.lastName, p.email, p.phone].filter(Boolean).some((v: string) => v.toLowerCase().includes(q)),
    );
  }, [people, peopleSearch]);

  const pickPerson = (p: any) => {
    setResident((cur) => ({
      ...cur,
      personId: p.id,
      email: p.email || '',
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      phone: p.phone || '',
      roleName: p.type === 'tenant' ? 'tenant' : 'owner',
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (!resident.personId) throw new Error('Pick a person from the directory first');
      if (!resident.email.trim()) throw new Error('Email is required — type one or pick a person who already has one');
      const idemp = `invite-${resident.email.trim().toLowerCase()}-${Date.now()}`;
      const payload: any = {
        kind: 'resident',
        email: resident.email.trim().toLowerCase(),
        firstName: resident.firstName || undefined,
        lastName: resident.lastName || undefined,
        roleName: resident.roleName,
        personId: resident.personId,
        ...(resident.enterpriseAccess ? { enterpriseAccess: true } : {}),
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
            <Home className="h-5 w-5 text-graphite" />Invite resident
          </h1>
          <p className="mt-1 text-body text-muted-foreground">
            Owners and tenants who sign into the resident app. Inviting staff instead?{' '}
            <Link href="/admin/team/invites/new" className="text-ember-orange hover:underline inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" />Invite a team member
            </Link>.
          </p>
        </div>
      </header>

      <form onSubmit={submit}>
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-caption text-muted-foreground">
              Pick the person from your People directory — their unit occupancies, invoices and gate-pass
              history will be visible the moment they sign in.
            </p>

            <div className="space-y-1.5">
              <Label>Person <span className="text-coral-red">*</span></Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={peopleSearch} onChange={(e) => setPeopleSearch(e.target.value)}
                  placeholder="Search by name, email, or phone…" />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg bg-stone-surface/40 shadow-inset-stone">
                {filteredPeople.length === 0 ? (
                  <p className="px-3 py-2.5 text-caption text-muted-foreground">
                    No matches. <Link href="/admin/people" className="text-ember-orange hover:underline">Add the person to your directory first</Link>.
                  </p>
                ) : (
                  <ul className="divide-y divide-stone-surface">
                    {filteredPeople.slice(0, 50).map((p) => {
                      const selected = resident.personId === p.id;
                      return (
                        <li key={p.id}>
                          <button type="button" onClick={() => pickPerson(p)}
                            className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors',
                              selected ? 'bg-card text-charcoal-primary' : 'hover:bg-card/60')}>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-charcoal-primary truncate">{p.firstName} {p.lastName}</p>
                              <p className="text-caption text-muted-foreground truncate">{p.email || p.phone || 'no contact on file'}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant={p.type === 'tenant' ? 'info' : p.type === 'stakeholder' ? 'muted' : 'success'}>{p.type}</Badge>
                              {selected && <UserCheck className="h-3.5 w-3.5 text-meadow-green" />}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {resident.personId && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>First name</Label>
                    <Input value={resident.firstName} onChange={(e) => setResident({ ...resident, firstName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last name</Label>
                    <Input value={resident.lastName} onChange={(e) => setResident({ ...resident, lastName: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Email <span className="text-coral-red">*</span></Label>
                    <Input type="email" required value={resident.email}
                      onChange={(e) => setResident({ ...resident, email: e.target.value })} placeholder="resident@example.com" />
                    {!resident.email && (
                      <p className="text-caption text-muted-foreground">
                        This person doesn't have an email on file — add one here, or update them in /admin/people first.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input type="tel" value={resident.phone} onChange={(e) => setResident({ ...resident, phone: e.target.value })} placeholder="optional" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Role on the unit</Label>
                  <select value={resident.roleName} onChange={(e) => setResident({ ...resident, roleName: e.target.value as 'owner' | 'tenant' })} className={selectClass}>
                    <option value="owner">Owner — titled property owner</option>
                    <option value="tenant">Tenant — renting</option>
                  </select>
                </div>
                <label className="flex items-start gap-2 rounded-lg bg-stone-surface/40 p-3 text-caption text-graphite">
                  <input type="checkbox" checked={resident.enterpriseAccess}
                    onChange={(e) => setResident({ ...resident, enterpriseAccess: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-ember-orange" />
                  <span>
                    Also grant admin console access.
                    <span className="block text-muted-foreground">
                      Tick this if the resident is also on the board / exco and needs access to /admin. Most residents shouldn't.
                    </span>
                  </span>
                </label>
              </>
            )}

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
