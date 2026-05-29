'use client';

/**
 * Person detail page — who someone is, what they own, where they live, and a
 * birds-eye view of everything they touch across the platform.
 *
 *   Person.type           — global classification (owner / tenant / stakeholder)
 *   UnitOwnership          — the units they hold title to (may differ from where they live)
 *   UnitOccupancy.role     — per-unit occupancy (owner-occupier / tenant)
 *
 * Ownership and occupancy are distinct: an owner can rent OUT one unit while
 * renting somewhere else. The activity timeline folds ownership, occupancy,
 * billing, gate passes, violations and requests into one reverse-chrono feed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Mail, Phone, MapPin, History, ArrowRight, KeyRound, Users, Calendar,
  Receipt, ShieldAlert, Inbox, Activity, Home, Pencil,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/use-toast';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { formatDate, formatCurrency, getInitials, cn } from '@/lib/utils';

function personTypeLabel(t?: string): string {
  switch (t) { case 'tenant': return 'Tenant'; case 'stakeholder': return 'Stakeholder'; default: return 'Owner'; }
}
function personTypeVariant(t?: string): 'success' | 'info' | 'muted' {
  switch (t) { case 'tenant': return 'info'; case 'stakeholder': return 'muted'; default: return 'success'; }
}

const timelineMeta: Record<string, { icon: any; tone: string }> = {
  ownership_start: { icon: KeyRound, tone: 'text-meadow-green' },
  ownership_end: { icon: KeyRound, tone: 'text-muted-foreground' },
  occupancy_start: { icon: Home, tone: 'text-info' },
  occupancy_end: { icon: Home, tone: 'text-muted-foreground' },
  invoice: { icon: Receipt, tone: 'text-graphite' },
  gate_pass: { icon: KeyRound, tone: 'text-graphite' },
  violation: { icon: ShieldAlert, tone: 'text-coral-red' },
  request: { icon: Inbox, tone: 'text-graphite' },
};

export default function PersonDetailPage() {
  const { id } = useParams();
  const [person, setPerson] = useState<any>(null);
  const [activity, setActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const fetchPerson = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get<any>(`/people/${id}`).then((r) => setPerson(r.data)),
      api.get<any>(`/people/${id}/activity`).then((r) => setActivity(r.data)).catch(() => setActivity(null)),
    ])
      .catch(() => setPerson(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchPerson(); }, [fetchPerson]);

  const { activeOcc, historicalOcc } = useMemo(() => {
    const occs = (person?.occupancies ?? []) as any[];
    return {
      activeOcc: occs.filter((o) => o.isActive),
      historicalOcc: occs.filter((o) => !o.isActive)
        .sort((a, b) => new Date(b.endDate || b.startDate).getTime() - new Date(a.endDate || a.startDate).getTime()),
    };
  }, [person]);
  const activeOwn = useMemo(() => (person?.ownerships ?? []).filter((o: any) => o.isActive), [person]);

  if (loading) {
    return <div className="space-y-6"><Skeleton className="h-6 w-32" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  }
  if (!person) {
    return (
      <EmptyState variant="card" icon={Users} title="Person not found"
        description="This person may have been removed, or you may not have access."
        action={{ label: 'All people', href: '/admin/people' }} />
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/people" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors">
        <ChevronLeft className="h-3 w-3" /> All people
      </Link>

      {/* Header — photo + identity + contact. */}
      <header className="flex flex-wrap items-start gap-4">
        {person.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.photoUrl} alt={`${person.firstName} ${person.lastName}`}
            className="h-16 w-16 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-stone-surface text-heading-sm font-medium text-graphite">
            {getInitials(person.firstName, person.lastName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">{person.firstName} {person.lastName}</h1>
            <Badge variant={personTypeVariant(person.type)}>{personTypeLabel(person.type)}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-body text-muted-foreground">
            {person.email && <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1.5 hover:text-graphite"><Mail className="h-3.5 w-3.5" />{person.email}</a>}
            {person.phone && <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1.5 hover:text-graphite"><Phone className="h-3.5 w-3.5" />{person.phone}</a>}
            {!person.email && !person.phone && <span className="text-muted-foreground/60 italic">No contact info on file</span>}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />Edit
        </Button>
      </header>

      {/* Birds-eye summary */}
      {activity?.summary && (
        <section>
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-heading-sm font-display font-medium text-charcoal-primary">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />Birds-eye view
          </h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Units owned" value={activity.summary.unitsOwned} icon={KeyRound} />
            <StatCard label="Occupied" value={activity.summary.unitsOccupied} icon={Home} />
            <StatCard label="Invoices" value={activity.summary.invoices} icon={Receipt} />
            <StatCard label="Gate passes" value={activity.summary.gatePasses} icon={KeyRound} />
            <StatCard label="Violations" value={activity.summary.violations} icon={ShieldAlert} />
            <StatCard label="Requests" value={activity.summary.requests} icon={Inbox} />
          </div>
        </section>
      )}

      {/* Owns */}
      {activeOwn.length > 0 && (
        <section>
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-heading-sm font-display font-medium text-charcoal-primary">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />Owns
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {activeOwn.map((own: any) => {
              const occs = (own.unit?.occupancies ?? []) as any[];
              const tenant = occs.find((o) => o.role === 'tenant');
              return (
                <Card key={own.id}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="success"><KeyRound className="mr-1 h-3 w-3" />Owner</Badge>
                      <Badge variant={tenant ? 'info' : 'success'}>{tenant ? 'Rented out' : 'Owner-occupied'}</Badge>
                    </div>
                    <p className="mt-2 text-heading-sm font-medium text-charcoal-primary">
                      Unit {own.unit?.unitNumber}{own.unit?.block && <span className="text-muted-foreground"> · Block {own.unit.block}</span>}
                    </p>
                    {own.unit?.estate?.name && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted-foreground"><MapPin className="h-3 w-3" />{own.unit.estate.name}</p>
                    )}
                    <p className="mt-2 inline-flex items-center gap-1.5 text-caption text-muted-foreground"><Calendar className="h-3 w-3" />Owner since {formatDate(own.startDate)}</p>
                    {tenant && (
                      <p className="mt-2 text-caption text-muted-foreground">Tenant:{' '}
                        <Link href={`/admin/people/${tenant.person.id}`} className="font-medium text-graphite hover:text-ember-orange">{tenant.person.firstName} {tenant.person.lastName}</Link>
                      </p>
                    )}
                    <Link href={`/admin/units/${own.unit?.id}`} className="mt-3 inline-flex items-center gap-1 text-caption font-medium text-ember-orange hover:underline">
                      View unit details <ArrowRight className="h-3 w-3" />
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Lives in (active occupancies) */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">Lives in</h2>
          <p className="text-caption text-muted-foreground">{activeOcc.length} {activeOcc.length === 1 ? 'unit' : 'units'}</p>
        </div>
        {activeOcc.length === 0 ? (
          <EmptyState variant="card" icon={MapPin} title="Not living in any unit"
            description={person.type === 'stakeholder'
              ? 'Stakeholders typically aren\'t tied to a specific unit.'
              : 'Record an occupancy from the unit page so billing, gate passes and notices reach them.'} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {activeOcc.map((occ) => <OccupancyCard key={occ.id} occ={occ} />)}
          </div>
        )}
      </section>

      {/* Activity timeline */}
      {activity?.timeline?.length > 0 && (
        <section>
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-heading-sm font-display font-medium text-charcoal-primary">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />Activity timeline
          </h2>
          <Card><CardContent className="p-0">
            <ul className="divide-y divide-stone-surface">
              {activity.timeline.map((ev: any, i: number) => {
                const meta = timelineMeta[ev.type] ?? { icon: Activity, tone: 'text-graphite' };
                const Icon = meta.icon;
                return (
                  <li key={i} className="flex items-start gap-3 px-5 py-3 text-sm">
                    <span className={cn('mt-0.5 shrink-0', meta.tone)}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-graphite">{ev.title}</p>
                      {ev.meta?.status && <p className="text-caption text-muted-foreground capitalize">{String(ev.meta.status).replace('_', ' ')}</p>}
                    </div>
                    <p className="shrink-0 text-caption text-muted-foreground">{formatDate(ev.at)}</p>
                  </li>
                );
              })}
            </ul>
          </CardContent></Card>
        </section>
      )}

      {/* Occupancy history */}
      {historicalOcc.length > 0 && (
        <section>
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-heading-sm font-display font-medium text-charcoal-primary">
            <History className="h-3.5 w-3.5 text-muted-foreground" />Occupancy history
          </h2>
          <Card><CardContent className="p-0">
            <ul className="divide-y divide-stone-surface">
              {historicalOcc.map((occ) => (
                <li key={occ.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="muted">{occ.role === 'owner' ? 'owner-occupier' : 'tenant'}</Badge>
                    <Link href={`/admin/units/${occ.unit?.id}`} className="truncate text-graphite hover:text-ember-orange transition-colors">
                      {occ.unit?.estate?.name} · Unit {occ.unit?.unitNumber}
                    </Link>
                  </div>
                  <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                    <Calendar className="h-3 w-3" />{formatDate(occ.startDate)} – {occ.endDate ? formatDate(occ.endDate) : '—'}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent></Card>
        </section>
      )}

      <EditPersonDrawer open={editing} onOpenChange={setEditing} person={person} onDone={fetchPerson} />
    </div>
  );
}

function OccupancyCard({ occ }: { occ: any }) {
  const unit = occ.unit;
  const estate = unit?.estate;
  const others = ((unit?.occupancies ?? []) as any[]).filter((o) => o.id !== occ.id);
  const otherOwner = others.find((o) => o.role === 'owner');
  const status = occ.role === 'owner' ? { label: 'Owner-occupied', tone: 'success' as const } : { label: 'Renting', tone: 'info' as const };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={occ.role === 'owner' ? 'success' : 'info'}>
            {occ.role === 'owner' ? <><KeyRound className="mr-1 h-3 w-3" />Owner-occupier</> : <><Users className="mr-1 h-3 w-3" />Tenant</>}
          </Badge>
          <Badge variant={status.tone}>{status.label}</Badge>
          {occ.isPrimaryContact && <Badge variant="muted">Primary contact</Badge>}
        </div>
        <p className="mt-2 text-heading-sm font-medium text-charcoal-primary">
          Unit {unit?.unitNumber}{unit?.block && <span className="text-muted-foreground"> · Block {unit.block}</span>}
        </p>
        {estate?.name && <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted-foreground"><MapPin className="h-3 w-3" />{estate.name}</p>}
        <p className="mt-2 inline-flex items-center gap-1.5 text-caption text-muted-foreground"><Calendar className="h-3 w-3" />Since {formatDate(occ.startDate)}</p>
        {occ.role === 'tenant' && otherOwner && (
          <p className="mt-2 text-caption text-muted-foreground">Landlord:{' '}
            <Link href={`/admin/people/${otherOwner.person.id}`} className="font-medium text-graphite hover:text-ember-orange">{otherOwner.person.firstName} {otherOwner.person.lastName}</Link>
          </p>
        )}
        {unit?.id && (
          <Link href={`/admin/units/${unit.id}`} className="mt-3 inline-flex items-center gap-1 text-caption font-medium text-ember-orange hover:underline">
            View unit details <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function EditPersonDrawer({ open, onOpenChange, person, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; person: any; onDone: () => void;
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', type: 'owner' as 'owner' | 'tenant' | 'stakeholder' });
  const [photo, setPhoto] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && person) {
      setForm({
        firstName: person.firstName || '', lastName: person.lastName || '',
        email: person.email || '', phone: person.phone || '', type: person.type || 'owner',
      });
      setPhoto(person.photoUrl ? [{ url: person.photoUrl, filename: 'photo', contentType: 'image/*' }] : []);
    }
  }, [open, person]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.put(`/people/${person.id}`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        type: form.type,
        photoUrl: photo[0]?.url ?? null,
      });
      toast({ variant: 'success', title: 'Person updated' });
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  const selectClass = cn(
    'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
    'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="md">
        <form onSubmit={submit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle>Edit person</DrawerTitle>
            <DrawerDescription>Update contact details, type and photo.</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="etype">Type</Label>
              <select id="etype" className={selectClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
                <option value="owner">Owner</option>
                <option value="tenant">Tenant</option>
                <option value="stakeholder">Stakeholder</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="efn">First name</Label>
                <Input id="efn" value={form.firstName} required onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="eln">Last name</Label>
                <Input id="eln" value={form.lastName} required onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="eem">Email</Label>
              <Input id="eem" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="eph">Phone</Label>
              <Input id="eph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <FileUpload label="Photo" kind="user_avatar" maxFiles={1}
              accept={['image/png', 'image/jpeg', 'image/webp']} value={photo} onChange={setPhoto} />
          </DrawerBody>
          <DrawerFooter>
            <Button type="submit" loading={submitting}>Save changes</Button>
            <DrawerClose asChild><Button type="button" variant="secondary">Cancel</Button></DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
