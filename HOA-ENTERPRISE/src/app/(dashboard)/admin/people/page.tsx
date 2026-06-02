'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Mail, Phone, Search, ClipboardList } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { cn, getInitials } from '@/lib/utils';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { ViewToggle, useViewMode } from '@/components/ui/view-toggle';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import { Users } from 'lucide-react';
import { refreshSetupProgress } from '@/components/layout/setup-progress';

/** Display label + badge tint for the Person.type values. */
function personTypeLabel(t?: string): string {
  switch (t) {
    case 'tenant': return 'Tenant';
    case 'stakeholder': return 'Stakeholder';
    case 'owner':
    default: return 'Owner';
  }
}
function personTypeVariant(t?: string): 'success' | 'info' | 'muted' {
  switch (t) {
    case 'tenant': return 'info';
    case 'stakeholder': return 'muted';
    case 'owner':
    default: return 'success';
  }
}

export default function PeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<{ firstName: string; lastName: string; email: string; phone: string; type: 'owner' | 'tenant' | 'stakeholder' }>({
    firstName: '', lastName: '', email: '', phone: '', type: 'owner',
  });
  const [photo, setPhoto] = useState<UploadedFile[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'owner' | 'tenant' | 'stakeholder'>('all');

  const fetchPeople = (q?: string, t?: typeof typeFilter) => {
    const params = new URLSearchParams();
    if (q) params.set('search', q);
    const filterValue = t ?? typeFilter;
    if (filterValue && filterValue !== 'all') params.set('type', filterValue);
    const qs = params.toString() ? `?${params}` : '';
    api
      .get<any>(`/people${qs}`)
      .then((res) => setPeople(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPeople(search, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  // Debounce the search → server roundtrip. Without this we fire one GET per
  // keystroke, and the response order isn't guaranteed — a fast typist sees
  // results race, replace each other, and visually flicker. 200ms is short
  // enough to feel live but coalesces a typical word into one request.
  useEffect(() => {
    const t = setTimeout(() => fetchPeople(search, typeFilter), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Create a person, optionally also sending them a resident invite (so they can
  // set up a login) in the same action — reuses POST /team/invites.
  const submitPerson = async (invite: boolean) => {
    if (invite && !form.email.trim()) {
      toast({ variant: 'error', title: 'Email required to invite', description: 'Add an email address to send an invitation.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<any>('/people', { ...form, photoUrl: photo[0]?.url });
      // Prepend the new row instead of refetching the whole list (avoids the
      // flicker of a full list replace during the drawer's close animation).
      const created = res?.data;
      if (created?.id) {
        setPeople((cur) => {
          if (cur.some((p) => p.id === created.id)) return cur;
          if (typeFilter !== 'all' && created.type !== typeFilter) return cur;
          return [created, ...cur];
        });
      } else {
        fetchPeople(search);
      }

      if (invite && created?.id) {
        const roleName = created.type === 'tenant' ? 'tenant' : 'owner';
        const idemp = `invite-${form.email.trim().toLowerCase()}-${Date.now()}`;
        const inv = await api.post<any>('/team/invites', {
          kind: 'resident',
          email: form.email.trim().toLowerCase(),
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          roleName,
          personId: created.id,
        }, idemp);
        const url = `${process.env.NEXT_PUBLIC_RESIDENTS_URL || 'http://localhost:3005'}/invites/${inv.data.token}`;
        try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
        toast({ variant: 'success', title: 'Person added & invited', description: 'Invite link copied to clipboard.' });
      } else {
        toast({ variant: 'success', title: 'Person added', description: `${form.firstName} ${form.lastName}` });
      }
      refreshSetupProgress(); // residents step may now be complete
      setShowCreate(false);
      setForm({ firstName: '', lastName: '', email: '', phone: '', type: 'owner' });
      setPhoto([]);
    } catch (err: any) {
      toast({ variant: 'error', title: invite ? 'Could not add & invite' : 'Could not add person', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => { e.preventDefault(); submitPerson(false); };

  const [view, setView] = useViewMode('people', 'card');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">People</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Owners, tenants and stakeholders linked to your units.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <ViewToggle value={view} onChange={setView} />
          <Link href="/admin/people/invites">
            <Button variant="ghost">
              <ClipboardList className="mr-1.5 h-4 w-4" />
              Invites
            </Button>
          </Link>
          <Link href="/admin/people/invites/new">
            <Button variant="secondary">
              <Mail className="mr-1.5 h-4 w-4" />
              Invite resident
            </Button>
          </Link>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add person
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Type filter — keeps the URL of-page-state via React state only; if
            we eventually want shareable filtered views we'll mirror it to the
            search params here. */}
        <div className="inline-flex items-center gap-0.5 rounded-pill bg-stone-surface p-0.5 text-caption">
          {(['all', 'owner', 'tenant', 'stakeholder'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setTypeFilter(opt)}
              className={cn(
                'rounded-pill px-3 py-1.5 capitalize transition-colors',
                typeFilter === opt
                  ? 'bg-card text-charcoal-primary shadow-inset-stone font-medium'
                  : 'text-graphite hover:text-charcoal-primary',
              )}
            >
              {opt === 'all' ? 'All' : `${opt}s`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : people.length === 0 ? (
        <EmptyState
          variant="card"
          icon={Users}
          title={search ? 'No matches' : 'No people yet'}
          description={
            search
              ? `Nothing found for "${search}". Try a shorter query or check spelling.`
              : 'Add owners and tenants to start managing occupancy, billing and visitor passes.'
          }
          action={search ? undefined : { label: 'Add person', onClick: () => setShowCreate(true) }}
        />
      ) : view === 'card' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {people.map((person: any) => (
            <Link
              key={person.id}
              href={`/admin/people/${person.id}`}
              className="block transition-shadow hover:shadow-soft rounded-2xl"
            >
              <Card>
                <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  {person.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={person.photoUrl.startsWith('/') ? `${process.env.NEXT_PUBLIC_API_URL || ''}${person.photoUrl}` : person.photoUrl}
                      alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-surface text-[13px] font-medium text-graphite">
                      {getInitials(person.firstName, person.lastName)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-heading-sm font-medium text-charcoal-primary truncate">
                        {person.firstName} {person.lastName}
                      </p>
                      <Badge variant={personTypeVariant(person.type)}>
                        {personTypeLabel(person.type)}
                      </Badge>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {person.email && (
                        <p className="flex items-center gap-1.5 text-caption text-muted-foreground truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          {person.email}
                        </p>
                      )}
                      {person.phone && (
                        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          {person.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                {person.occupancies?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {person.occupancies.map((o: any) => (
                      <Badge
                        key={o.id}
                        variant={o.role === 'owner' ? 'success' : 'info'}
                      >
                        Unit {o.unit?.unitNumber} · {o.role}
                      </Badge>
                    ))}
                  </div>
                )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Phone</th>
                    <th className="px-6 py-3">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-surface">
                  {people.map((person: any) => (
                    <tr
                      key={person.id}
                      className="cursor-pointer transition-colors hover:bg-stone-surface/40"
                      onClick={() => router.push(`/admin/people/${person.id}`)}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-surface text-[11px] font-medium text-graphite">
                            {getInitials(person.firstName, person.lastName)}
                          </div>
                          <span className="font-medium text-charcoal-primary">
                            {person.firstName} {person.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={personTypeVariant(person.type)}>
                          {personTypeLabel(person.type)}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {person.email || <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {person.phone || <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="px-6 py-3">
                        {person.occupancies?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {person.occupancies.slice(0, 3).map((o: any) => (
                              <Badge key={o.id} variant={o.role === 'owner' ? 'success' : 'info'}>
                                {o.unit?.unitNumber}
                              </Badge>
                            ))}
                            {person.occupancies.length > 3 && (
                              <Badge variant="muted">+{person.occupancies.length - 3}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Drawer open={showCreate} onOpenChange={setShowCreate}>
        <DrawerContent size="md">
          <form onSubmit={handleCreate} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>New person</DrawerTitle>
              <DrawerDescription>
                Add an owner, tenant, or stakeholder. Link them to a unit afterwards in the estate view.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ptype">Type</Label>
                <select
                  id="ptype"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
                  className="flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <option value="owner">Owner — titled property owner</option>
                  <option value="tenant">Tenant — renting from an owner</option>
                  <option value="stakeholder">Stakeholder — board, vendor contact, exco</option>
                </select>
                <p className="text-caption text-muted-foreground">
                  You can link them to a specific unit afterwards from the estate view.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="resident@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" placeholder="+27 82 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <p className="text-caption text-muted-foreground">
                  Used for visitor pass SMS and gate notifications when enabled.
                </p>
              </div>
              <div className="space-y-1.5">
                <FileUpload
                  label="Photo (optional)"
                  helpText="A headshot shown on the person's profile and occupant cards."
                  kind="user_avatar"
                  maxFiles={1}
                  accept={['image/png', 'image/jpeg', 'image/webp']}
                  value={photo}
                  onChange={setPhoto}
                />
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" loading={submitting}>
                {submitting ? 'Saving…' : 'Add person'}
              </Button>
              <Button type="button" variant="secondary" disabled={submitting} onClick={() => submitPerson(true)} title="Create the person and send them a resident invite">
                Add &amp; invite
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
