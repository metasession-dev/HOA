'use client';

/**
 * Unit detail page. The home for everything about a single unit:
 *   - Identity (number / block / street / floor / type / estate)
 *   - Owner — the persistent title chain (transfer on sale)
 *   - Active occupant (owner-occupier or tenant) — change on move-out
 *   - Household members (additional occupants)
 *   - Ownership + occupancy history
 *   - Recent invoices
 *
 * Ownership and occupancy are deliberately separate: an owner can rent the unit
 * out (owner in the title chain, tenant as the active occupant). History stays
 * with the unit + owner; occupancy history belongs to the occupant.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Home, Building2, MapPin, History, KeyRound, Users, Calendar,
  Receipt, ArrowRight, ArrowLeftRight, UserPlus, Plus, X, Repeat, Signpost,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

const invoiceBadgeMap: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive'> = {
  draft: 'muted', sent: 'info', partial: 'warning', paid: 'success', overdue: 'destructive', cancelled: 'muted',
};

const ACQUISITION_METHODS = [
  { id: 'purchase', label: 'Purchase / sale' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'inheritance', label: 'Inheritance' },
  { id: 'gift', label: 'Gift' },
  { id: 'initial', label: 'Initial record' },
  { id: 'other', label: 'Other' },
];
const GENDERS = ['male', 'female', 'other', 'undisclosed'];
const RELATIONSHIPS = ['spouse', 'partner', 'child', 'parent', 'sibling', 'relative', 'domestic_staff', 'other'];
const AGE_GROUPS = ['infant', 'child', 'teenager', 'adult', 'senior'];

const personName = (p: any) => (p ? `${p.firstName} ${p.lastName}` : '—');

export default function UnitDetailPage() {
  const { unitId } = useParams();
  const confirm = useConfirm();
  const [unit, setUnit] = useState<any>(null);
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<null | 'owner' | 'occupant' | 'household'>(null);

  const fetchUnit = useCallback(() => {
    if (!unitId) return;
    setLoading(true);
    Promise.all([
      api.get<any>(`/units/${unitId}`).then((r) => setUnit(r.data)),
      api.get<any>('/people?limit=1000').then((r) => setPeople(r.data || [])).catch(() => setPeople([])),
    ])
      .catch(() => setUnit(null))
      .finally(() => setLoading(false));
  }, [unitId]);

  useEffect(() => { fetchUnit(); }, [fetchUnit]);

  const activeOwner = useMemo(() => (unit?.ownerships ?? []).find((o: any) => o.isActive) ?? null, [unit]);
  const ownershipHistory = useMemo(
    () => (unit?.ownerships ?? []).filter((o: any) => !o.isActive)
      .sort((a: any, b: any) => new Date(b.endDate || b.startDate).getTime() - new Date(a.endDate || a.startDate).getTime()),
    [unit],
  );
  const activeOccupant = useMemo(() => (unit?.occupancies ?? []).find((o: any) => o.isActive) ?? null, [unit]);
  const occupancyHistory = useMemo(
    () => (unit?.occupancies ?? []).filter((o: any) => !o.isActive)
      .sort((a: any, b: any) => new Date(b.endDate || b.startDate).getTime() - new Date(a.endDate || a.startDate).getTime()),
    [unit],
  );
  const household = useMemo(() => (unit?.additionalOccupants ?? []).filter((o: any) => o.isActive), [unit]);

  const endOccupant = async (occ: any) => {
    const ok = await confirm({
      title: `End ${personName(occ.person)}'s occupancy?`,
      description: 'They will be moved to history. The owner (title) is unaffected.',
      confirmText: 'End occupancy',
    });
    if (!ok) return;
    try {
      await api.put(`/people/occupancies/${occ.id}/deactivate`);
      toast({ variant: 'success', title: 'Occupancy ended' });
      fetchUnit();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const removeHouseholdMember = async (m: any) => {
    const ok = await confirm({ title: `Remove ${m.firstName}?`, confirmText: 'Remove' });
    if (!ok) return;
    try {
      await api.delete(`/units/additional-occupants/${m.id}`);
      toast({ variant: 'success', title: 'Removed' });
      fetchUnit();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  if (loading) {
    return <div className="space-y-6"><Skeleton className="h-6 w-32" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  }
  if (!unit) {
    return (
      <EmptyState variant="card" icon={Home} title="Unit not found"
        description="This unit may have been removed, or you may not have access."
        action={{ label: 'All units', href: '/admin/units' }} />
    );
  }

  const status = !activeOwner
    ? { label: 'No owner', tone: 'warning' as const }
    : activeOccupant?.role === 'tenant'
    ? { label: 'Rented', tone: 'info' as const }
    : activeOccupant
    ? { label: 'Owner-occupied', tone: 'success' as const }
    : { label: 'Vacant', tone: 'muted' as const };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/units" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors">
          <ChevronLeft className="h-3 w-3" /> Units
        </Link>
      </div>

      {/* Identity */}
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-icon bg-stone-surface">
          <Home className="h-6 w-6 text-graphite" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Unit {unit.unitNumber}</h1>
            <Badge variant={status.tone}>{status.label}</Badge>
            <Badge variant="muted" className="capitalize">{unit.type}</Badge>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-muted-foreground">
            {unit.block && <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Block {unit.block}</span>}
            {unit.street && <span className="inline-flex items-center gap-1.5"><Signpost className="h-3.5 w-3.5" />{unit.street}</span>}
            {unit.floor != null && <span className="inline-flex items-center gap-1.5"><span className="text-caption uppercase tracking-wider">Floor</span>{unit.floor}</span>}
            {unit.estate?.name && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                <span>{unit.estate.name}</span>
                {unit.estate.address && <span className="text-muted-foreground/80">· {unit.estate.address}</span>}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Owner + occupant */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Owner (title chain) */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Badge variant="success"><KeyRound className="mr-1 h-3 w-3" />Owner</Badge>
              <Button size="sm" variant="ghost" onClick={() => setDrawer('owner')}>
                <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />{activeOwner ? 'Transfer' : 'Set owner'}
              </Button>
            </div>
            {activeOwner ? (
              <>
                <Link href={`/admin/people/${activeOwner.person.id}`} className="mt-2 inline-block text-heading-sm font-medium text-charcoal-primary hover:text-ember-orange transition-colors">
                  {personName(activeOwner.person)}
                </Link>
                <div className="mt-1 space-y-0.5 text-caption text-muted-foreground">
                  {activeOwner.person.email && <p className="truncate">{activeOwner.person.email}</p>}
                  <p className="inline-flex items-center gap-1.5"><Calendar className="h-3 w-3" />Owner since {formatDate(activeOwner.startDate)}</p>
                  {activeOwner.acquisitionMethod && <p className="capitalize">via {String(activeOwner.acquisitionMethod).replace('_', ' ')}</p>}
                </div>
              </>
            ) : (
              <p className="mt-2 text-caption text-coral-red">No owner on record. Every unit must have an owner — set one.</p>
            )}
          </CardContent>
        </Card>

        {/* Active occupant */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Badge variant={activeOccupant?.role === 'tenant' ? 'info' : 'success'}>
                <Users className="mr-1 h-3 w-3" />{activeOccupant?.role === 'tenant' ? 'Tenant' : 'Occupant'}
              </Badge>
              <div className="flex gap-1">
                {activeOccupant && (
                  <Button size="sm" variant="ghost" onClick={() => endOccupant(activeOccupant)}>End</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDrawer('occupant')}>
                  <Repeat className="mr-1 h-3.5 w-3.5" />{activeOccupant ? 'Change' : 'Set occupant'}
                </Button>
              </div>
            </div>
            {activeOccupant ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <Link href={`/admin/people/${activeOccupant.person.id}`} className="text-heading-sm font-medium text-charcoal-primary hover:text-ember-orange transition-colors">
                    {personName(activeOccupant.person)}
                  </Link>
                  {activeOccupant.role === 'owner' && <Badge variant="muted">Owner-occupier</Badge>}
                </div>
                <div className="mt-1 space-y-0.5 text-caption text-muted-foreground">
                  {activeOccupant.person.phone && <p>{activeOccupant.person.phone}</p>}
                  <p className="inline-flex items-center gap-1.5"><Calendar className="h-3 w-3" />Since {formatDate(activeOccupant.startDate)}</p>
                  {activeOccupant.householdSize != null && <p>Household of {activeOccupant.householdSize}</p>}
                </div>
              </>
            ) : (
              <p className="mt-2 text-caption text-muted-foreground">No active occupant. The unit is vacant or owner-occupancy hasn’t been recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Household members */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">Household members</h2>
          <Button size="sm" variant="secondary" onClick={() => setDrawer('household')}>
            <UserPlus className="mr-1 h-3.5 w-3.5" />Add member
          </Button>
        </div>
        {household.length === 0 ? (
          <EmptyState variant="card" icon={Users} title="No additional occupants listed"
            description="List family members, dependents or domestic staff living in the unit — name, relationship, gender and age group." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {household.map((m: any) => (
              <Card key={m.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-charcoal-primary truncate">{m.firstName} {m.lastName ?? ''}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1 text-caption capitalize">
                        {m.relationship && <Badge variant="muted">{String(m.relationship).replace('_', ' ')}</Badge>}
                        {m.ageGroup && <Badge variant="muted">{m.ageGroup}</Badge>}
                        {m.gender && <Badge variant="muted">{m.gender}</Badge>}
                      </p>
                    </div>
                    <button onClick={() => removeHouseholdMember(m)} className="text-muted-foreground hover:text-coral-red" title="Remove">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent invoices */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-heading-sm font-display font-medium text-charcoal-primary inline-flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />Recent invoices
          </h2>
          {unit.invoices?.length > 0 && (
            <Link href={`/finance/invoices?unitId=${unit.id}`} className="text-caption font-medium text-ember-orange hover:underline">View all</Link>
          )}
        </div>
        {(!unit.invoices || unit.invoices.length === 0) ? (
          <EmptyState variant="card" icon={Receipt} title="No invoices yet"
            description="When you bill this unit, the most recent invoices will appear here." />
        ) : (
          <Card><CardContent className="p-0">
            <ul className="divide-y divide-stone-surface">
              {unit.invoices.map((inv: any) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/finance/invoices/${inv.id}`} className="font-medium text-graphite hover:text-ember-orange transition-colors">{inv.invoiceNumber}</Link>
                    <p className="text-caption text-muted-foreground">Due {formatDate(inv.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="tabular-nums text-graphite">{formatCurrency(Number(inv.amount), inv.currency)}</span>
                    <Badge variant={invoiceBadgeMap[inv.status] || 'muted'}>{inv.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent></Card>
        )}
      </section>

      {/* Ownership history */}
      {ownershipHistory.length > 0 && (
        <HistorySection title="Ownership history" icon={KeyRound}
          rows={ownershipHistory.map((o: any) => ({
            id: o.id, person: o.person, badge: String(o.acquisitionMethod || 'owner').replace('_', ' '),
            start: o.startDate, end: o.endDate,
          }))} />
      )}

      {/* Occupancy history */}
      {occupancyHistory.length > 0 && (
        <HistorySection title="Occupancy history" icon={History}
          rows={occupancyHistory.map((o: any) => ({
            id: o.id, person: o.person, badge: o.role === 'owner' ? 'owner-occupier' : 'tenant',
            start: o.startDate, end: o.endDate,
          }))} />
      )}

      {/* Drawers */}
      <SetOwnerDrawer open={drawer === 'owner'} onOpenChange={(v) => setDrawer(v ? 'owner' : null)}
        unitId={unit.id} people={people} currentOwnerId={activeOwner?.person?.id} onDone={fetchUnit} />
      <SetOccupantDrawer open={drawer === 'occupant'} onOpenChange={(v) => setDrawer(v ? 'occupant' : null)}
        unit={unit} people={people} activeOccupant={activeOccupant} owner={activeOwner} onDone={fetchUnit} />
      <HouseholdDrawer open={drawer === 'household'} onOpenChange={(v) => setDrawer(v ? 'household' : null)}
        unitId={unit.id} onDone={fetchUnit} />
    </div>
  );
}

function HistorySection({ title, icon: Icon, rows }: { title: string; icon: any; rows: any[] }) {
  return (
    <section>
      <h2 className="mb-2 inline-flex items-center gap-1.5 text-heading-sm font-display font-medium text-charcoal-primary">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />{title}
      </h2>
      <Card><CardContent className="p-0">
        <ul className="divide-y divide-stone-surface">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="muted" className="capitalize">{r.badge}</Badge>
                {r.person && (
                  <Link href={`/admin/people/${r.person.id}`} className="text-graphite hover:text-ember-orange transition-colors truncate">
                    {personName(r.person)}
                  </Link>
                )}
              </div>
              <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                <Calendar className="h-3 w-3" />{formatDate(r.start)} – {r.end ? formatDate(r.end) : '—'}
              </p>
            </li>
          ))}
        </ul>
      </CardContent></Card>
    </section>
  );
}

// ---- Transfer / set owner ----
function SetOwnerDrawer({ open, onOpenChange, unitId, people, currentOwnerId, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; unitId: string; people: any[]; currentOwnerId?: string; onDone: () => void;
}) {
  const [personId, setPersonId] = useState('');
  const [method, setMethod] = useState('purchase');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setPersonId(''); setMethod(currentOwnerId ? 'transfer' : 'initial'); setStartDate(''); setNotes(''); } }, [open, currentOwnerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId) return;
    setSubmitting(true);
    try {
      await api.post(`/units/${unitId}/ownerships`, {
        personId, acquisitionMethod: method,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        notes: notes || undefined,
      });
      toast({ variant: 'success', title: currentOwnerId ? 'Ownership transferred' : 'Owner set' });
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="md">
        <form onSubmit={submit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle>{currentOwnerId ? 'Transfer ownership' : 'Set owner'}</DrawerTitle>
            <DrawerDescription>
              {currentOwnerId
                ? 'Record a sale or transfer. The current owner is moved to history and the new owner becomes active.'
                : 'Record the titled owner of this unit.'}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newOwner">New owner</Label>
              <select id="newOwner" className={selectClass} value={personId} onChange={(e) => setPersonId(e.target.value)} required>
                <option value="">Select person…</option>
                {people.filter((p) => p.id !== currentOwnerId).map((p) => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.email ? ` · ${p.email}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="method">Acquisition method</Label>
              <select id="method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                {ACQUISITION_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ostart">Effective date</Label>
              <Input id="ostart" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onotes">Notes (optional)</Label>
              <Input id="onotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Deed reference" />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button type="submit" loading={submitting}>{currentOwnerId ? 'Transfer' : 'Set owner'}</Button>
            <DrawerClose asChild><Button type="button" variant="secondary">Cancel</Button></DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

// ---- Set / change occupant ----
function SetOccupantDrawer({ open, onOpenChange, unit, people, activeOccupant, owner, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; unit: any; people: any[]; activeOccupant: any; owner: any; onDone: () => void;
}) {
  const [mode, setMode] = useState<'owner' | 'tenant'>('tenant');
  const [personId, setPersonId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [householdSize, setHouseholdSize] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setMode('tenant'); setPersonId(''); setStartDate(''); setHouseholdSize(''); } }, [open]);

  // Owner-occupier mode pre-fills the person to the current owner.
  const effectivePersonId = mode === 'owner' ? owner?.person?.id ?? '' : personId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectivePersonId) {
      toast({ variant: 'error', title: mode === 'owner' ? 'No owner on file' : 'Select a person' });
      return;
    }
    setSubmitting(true);
    try {
      // End the current occupant first (one active occupant per unit).
      if (activeOccupant) await api.put(`/people/occupancies/${activeOccupant.id}/deactivate`);
      await api.post(`/people/${effectivePersonId}/occupancies`, {
        unitId: unit.id,
        role: mode,
        startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
        isPrimaryContact: true,
        householdSize: householdSize === '' ? undefined : Number(householdSize),
      });
      toast({ variant: 'success', title: 'Occupant updated' });
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="md">
        <form onSubmit={submit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle>{activeOccupant ? 'Change occupant' : 'Set occupant'}</DrawerTitle>
            <DrawerDescription>
              The active occupant is who lives in the unit — the owner (owner-occupier) or a tenant. Changing it ends the current occupancy.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="space-y-2">
              <Label>Occupant type</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'owner', label: 'Owner-occupier', hint: owner ? personName(owner.person) : 'No owner set' },
                  { id: 'tenant', label: 'Tenant', hint: 'A renter' },
                ] as const).map((opt) => (
                  <button key={opt.id} type="button" onClick={() => setMode(opt.id)}
                    className={cn('rounded-lg border p-3 text-left transition-colors',
                      mode === opt.id ? 'border-ember-orange bg-ember-orange/5' : 'border-stone-surface hover:bg-stone-surface/50')}>
                    <p className="text-sm font-medium text-charcoal-primary">{opt.label}</p>
                    <p className="text-caption text-muted-foreground truncate">{opt.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            {mode === 'tenant' && (
              <div className="space-y-1.5">
                <Label htmlFor="occPerson">Tenant</Label>
                <select id="occPerson" className={selectClass} value={personId} onChange={(e) => setPersonId(e.target.value)} required>
                  <option value="">Select person…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.email ? ` · ${p.email}` : ''}</option>)}
                </select>
              </div>
            )}
            {mode === 'owner' && !owner && (
              <p className="rounded-lg bg-coral-red/10 px-3 py-2 text-caption text-coral-red">Set an owner first before recording owner-occupancy.</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="occStart">Move-in date</Label>
                <Input id="occStart" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="occHh">Household size</Label>
                <Input id="occHh" type="number" min={1} value={householdSize} onChange={(e) => setHouseholdSize(e.target.value)} placeholder="optional" />
              </div>
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button type="submit" loading={submitting} disabled={mode === 'owner' && !owner}>Save occupant</Button>
            <DrawerClose asChild><Button type="button" variant="secondary">Cancel</Button></DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

// ---- Add household member ----
function HouseholdDrawer({ open, onOpenChange, unitId, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; unitId: string; onDone: () => void;
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', gender: '', relationship: '', ageGroup: '' });
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { if (open) setForm({ firstName: '', lastName: '', gender: '', relationship: '', ageGroup: '' }); }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/units/${unitId}/additional-occupants`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        gender: form.gender || undefined,
        relationship: form.relationship || undefined,
        ageGroup: form.ageGroup || undefined,
      });
      toast({ variant: 'success', title: 'Household member added' });
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="md">
        <form onSubmit={submit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle>Add household member</DrawerTitle>
            <DrawerDescription>A family member, dependent or domestic staff living in the unit. No login is created.</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hfn">First name</Label>
                <Input id="hfn" value={form.firstName} required autoFocus onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hln">Last name</Label>
                <Input id="hln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="hrel">Relationship</Label>
                <select id="hrel" className={selectClass} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
                  <option value="">—</option>
                  {RELATIONSHIPS.map((r) => <option key={r} value={r} className="capitalize">{r.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hage">Age group</Label>
                <select id="hage" className={selectClass} value={form.ageGroup} onChange={(e) => setForm({ ...form, ageGroup: e.target.value })}>
                  <option value="">—</option>
                  {AGE_GROUPS.map((a) => <option key={a} value={a} className="capitalize">{a}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hgen">Gender</Label>
                <select id="hgen" className={selectClass} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">—</option>
                  {GENDERS.map((g) => <option key={g} value={g} className="capitalize">{g}</option>)}
                </select>
              </div>
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button type="submit" loading={submitting}>Add member</Button>
            <DrawerClose asChild><Button type="button" variant="secondary">Cancel</Button></DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
