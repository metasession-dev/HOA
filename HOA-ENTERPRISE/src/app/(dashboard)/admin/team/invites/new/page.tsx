'use client';

/**
 * Two-tab invite flow:
 *
 *   • TEAM MEMBER — staff who'll log into the admin console. Picks a system
 *     role (excluding owner/tenant) or a custom role.
 *   • RESIDENT — owner/tenant who'll log into the resident PWA. Admin picks
 *     from existing People records via a searchable picker; first name /
 *     last name / phone / email are pulled from that Person and the invite
 *     is bound via `personId` so redemption sets Person.userId without
 *     creating a duplicate Person row.
 *
 * The two flows hit the same `POST /team/invites` endpoint; what differs is
 * the payload — kind, roleName, and the optional personId binding.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Briefcase, Home, Search, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

// Roles available to team-member invites. Excludes owner/tenant (those go
// through the resident flow) and super_admin (platform-level, not org-scoped).
const TEAM_ROLES = [
  'hoa_admin', 'property_manager', 'finance_officer',
  'exco_member', 'exco_chairperson', 'communications_manager',
  'gate_security', 'maintenance_coordinator', 'external_accountant',
] as const;

type Tab = 'team_member' | 'resident';

export default function NewInvitePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('team_member');
  const [customRoles, setCustomRoles] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  // Team-member form state
  const [team, setTeam] = useState({
    email: '', firstName: '', lastName: '',
    roleType: 'system' as 'system' | 'custom',
    roleName: 'property_manager' as string,
    customRoleId: '',
    expiresAt: '',
    approvalLimit: '',
  });

  // Resident form state
  const [resident, setResident] = useState({
    personId: '',
    roleName: 'owner' as 'owner' | 'tenant',
    // Editable overrides — admin can correct typos before sending. Start
    // blank; auto-fill when a person is picked.
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    // Off by default — residents should NOT have admin console access
    // unless explicitly granted. Toggle for the rare "exco who is also a
    // resident" case. Team_member invites always carry enterpriseAccess
    // implicitly so no checkbox needed there.
    enterpriseAccess: false,
  });
  const [peopleSearch, setPeopleSearch] = useState('');

  useEffect(() => {
    api.get<any>('/team/custom-roles').then((r) => setCustomRoles(r.data || [])).catch(() => {});
    api.get<any>('/people?limit=200').then((r) => setPeople(r.data || [])).catch(() => {});
  }, []);

  const filteredPeople = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.firstName, p.lastName, p.email, p.phone]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(q)),
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
      // Default the per-unit role to match their global Person.type when it
      // makes sense; otherwise leave whatever the admin chose.
      roleName: p.type === 'tenant' ? 'tenant' : 'owner',
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const idempSeed = tab === 'team_member' ? team.email : resident.email;
      const idemp = `invite-${(idempSeed || '').toLowerCase()}-${Date.now()}`;

      let payload: any;
      if (tab === 'team_member') {
        if (!team.email.trim()) {
          throw new Error('Email is required');
        }
        payload = {
          kind: 'team_member',
          email: team.email.trim().toLowerCase(),
          firstName: team.firstName || undefined,
          lastName: team.lastName || undefined,
          ...(team.roleType === 'system'
            ? { roleName: team.roleName }
            : { customRoleId: team.customRoleId }),
          ...(team.expiresAt ? { expiresAt: new Date(team.expiresAt).toISOString() } : {}),
          ...(team.approvalLimit ? { approvalLimit: Number(team.approvalLimit) } : {}),
        };
      } else {
        if (!resident.email.trim()) {
          throw new Error('Email is required — type one or pick a person who already has one');
        }
        if (!resident.personId) {
          throw new Error('Pick a person from the directory first');
        }
        payload = {
          kind: 'resident',
          email: resident.email.trim().toLowerCase(),
          firstName: resident.firstName || undefined,
          lastName: resident.lastName || undefined,
          roleName: resident.roleName,
          personId: resident.personId,
          // Only send when explicitly enabled — the backend derives the
          // default from kind when this field is absent.
          ...(resident.enterpriseAccess ? { enterpriseAccess: true } : {}),
        };
      }

      const r = await api.post<any>('/team/invites', payload, idemp);
      const url = `${process.env.NEXT_PUBLIC_RESIDENTS_URL || 'http://localhost:3005'}/invites/${r.data.token}`;
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      toast({
        variant: 'success',
        title: 'Invitation created',
        description: 'Link copied to clipboard',
      });
      router.push('/admin/team/invites');
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/admin/team/invites"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite"
      >
        <ChevronLeft className="h-3 w-3" />
        Invites
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">New invitation</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Pick the right kind: team members get the admin console, residents get the PWA.
        </p>
      </header>

      {/* Tab selector — full-width segmented control. */}
      <div role="tablist" className="grid grid-cols-2 gap-2 rounded-lg bg-stone-surface p-1">
        <TabButton active={tab === 'team_member'} onClick={() => setTab('team_member')} icon={Briefcase}>
          Team member
        </TabButton>
        <TabButton active={tab === 'resident'} onClick={() => setTab('resident')} icon={Home}>
          Resident
        </TabButton>
      </div>

      <form onSubmit={submit}>
        <Card>
          <CardContent className="space-y-4 p-6">
            {tab === 'team_member' ? (
              <>
                <p className="text-caption text-muted-foreground">
                  For property managers, finance officers, exco, gate security, etc. They sign in
                  to the admin console at this URL.
                </p>

                <div className="space-y-1.5">
                  <Label>Email <span className="text-coral-red">*</span></Label>
                  <Input
                    type="email"
                    required
                    value={team.email}
                    onChange={(e) => setTeam({ ...team, email: e.target.value })}
                    placeholder="finance@acme-hoa.co.za"
                  />
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
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTeam({ ...team, roleType: t })}
                        className={cn(
                          'rounded-pill px-3 py-1 text-caption font-medium transition-colors',
                          t === team.roleType ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card',
                        )}
                      >
                        {t === 'system' ? 'System role' : 'Custom role'}
                      </button>
                    ))}
                  </div>
                </div>

                {team.roleType === 'system' ? (
                  <div className="space-y-1.5">
                    <Label>Role <span className="text-coral-red">*</span></Label>
                    <select
                      required
                      value={team.roleName}
                      onChange={(e) => setTeam({ ...team, roleName: e.target.value })}
                      className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      {TEAM_ROLES.map((r) => (
                        <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Custom role <span className="text-coral-red">*</span></Label>
                    <select
                      required
                      value={team.customRoleId}
                      onChange={(e) => setTeam({ ...team, customRoleId: e.target.value })}
                      className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <option value="">— select —</option>
                      {customRoles.map((r) => <option key={r.id} value={r.id}>{r.displayName}</option>)}
                    </select>
                    {customRoles.length === 0 && (
                      <p className="text-caption text-muted-foreground">
                        No custom roles yet.{' '}
                        <Link href="/admin/team/roles" className="text-ember-orange hover:underline">
                          Create one
                        </Link>.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Expires (time-bound role)</Label>
                    <Input
                      type="date"
                      value={team.expiresAt}
                      onChange={(e) => setTeam({ ...team, expiresAt: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Approval limit</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={team.approvalLimit}
                      onChange={(e) => setTeam({ ...team, approvalLimit: e.target.value })}
                      placeholder="optional"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-caption text-muted-foreground">
                  For owners and tenants. Pick the person from your People directory — their
                  unit occupancies, invoices, and gate-pass history will be visible the moment
                  they sign in.
                </p>

                {/* People picker */}
                <div className="space-y-1.5">
                  <Label>Person <span className="text-coral-red">*</span></Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      value={peopleSearch}
                      onChange={(e) => setPeopleSearch(e.target.value)}
                      placeholder="Search by name, email, or phone…"
                    />
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
                              <button
                                type="button"
                                onClick={() => pickPerson(p)}
                                className={cn(
                                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors',
                                  selected ? 'bg-card text-charcoal-primary' : 'hover:bg-card/60',
                                )}
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-charcoal-primary truncate">
                                    {p.firstName} {p.lastName}
                                  </p>
                                  <p className="text-caption text-muted-foreground truncate">
                                    {p.email || p.phone || 'no contact on file'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Badge variant={p.type === 'tenant' ? 'info' : p.type === 'stakeholder' ? 'muted' : 'success'}>
                                    {p.type}
                                  </Badge>
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
                        <Input
                          type="email"
                          required
                          value={resident.email}
                          onChange={(e) => setResident({ ...resident, email: e.target.value })}
                          placeholder="resident@example.com"
                        />
                        {!resident.email && (
                          <p className="text-caption text-muted-foreground">
                            This person doesn't have an email on file — add one here, or update them in /admin/people first.
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Phone</Label>
                        <Input
                          type="tel"
                          value={resident.phone}
                          onChange={(e) => setResident({ ...resident, phone: e.target.value })}
                          placeholder="optional"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Role on the unit</Label>
                      <select
                        value={resident.roleName}
                        onChange={(e) => setResident({ ...resident, roleName: e.target.value as 'owner' | 'tenant' })}
                        className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <option value="owner">Owner — titled property owner</option>
                        <option value="tenant">Tenant — renting</option>
                      </select>
                    </div>
                    {/* Edge case: a resident who's also on the board. Off
                        by default — residents shouldn't see the admin
                        console unless explicitly authorised. */}
                    <label className="flex items-start gap-2 rounded-lg bg-stone-surface/40 p-3 text-caption text-graphite">
                      <input
                        type="checkbox"
                        checked={resident.enterpriseAccess}
                        onChange={(e) => setResident({ ...resident, enterpriseAccess: e.target.checked })}
                        className="mt-0.5 h-4 w-4 accent-ember-orange"
                      />
                      <span>
                        Also grant admin console access.
                        <span className="block text-muted-foreground">
                          Tick this if the resident is also on the board / exco
                          and needs access to /admin. Most residents shouldn't.
                        </span>
                      </span>
                    </label>
                  </>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-surface">
              <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" loading={busy}>
                {busy ? 'Creating…' : 'Send invitation'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-card text-charcoal-primary shadow-inset-stone'
          : 'text-graphite hover:text-charcoal-primary',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
