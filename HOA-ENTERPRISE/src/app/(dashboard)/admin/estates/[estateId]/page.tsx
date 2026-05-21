'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, Plus, MapPin, ChevronLeft, History, X, ArrowRight, Search, Users, Home, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatDate, cn } from '@/lib/utils';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { ViewToggle, useViewMode } from '@/components/ui/view-toggle';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Estate detail page. Two key flows:
 *   - Add a unit (drawer)
 *   - Manage a unit's occupants (drawer with active occupancies + history,
 *     plus an inline add-occupancy form). Ended occupancies are kept as
 *     historical rows so we can show "Mr Adebayo rented this unit from
 *     2024-Jan to 2025-Mar".
 */
export default function EstateDetailPage() {
  const { estateId } = useParams();
  const confirm = useConfirm();
  const [estate, setEstate] = useState<any>(null);
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddUnit, setShowAddUnit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unitForm, setUnitForm] = useState({ unitNumber: '', block: '', floor: '', type: 'apartment' });

  // Search + view toggle for the unit list. Default to table because property
  // managers usually want to scan many rows at once — they ask for cards when
  // they're showing the estate to someone, not when they're working.
  const [unitSearch, setUnitSearch] = useState('');
  const [view, setView] = useViewMode(`estate-units`, 'table');

  // Track only the *id* of the unit whose occupancy drawer is open. The
  // actual `occUnit` object is derived from the live `estate` state so a
  // refetch doesn't swap the object reference and re-mount the drawer (which
  // is what was causing the "two dialogs appear — one disappears, the other
  // comes up" flicker after adding/ending an occupancy).
  const [occUnitId, setOccUnitId] = useState<string | null>(null);
  const occUnit = useMemo(
    () => (estate?.units ?? []).find((u: any) => u.id === occUnitId) ?? null,
    [estate, occUnitId],
  );
  const [occForm, setOccForm] = useState<{ personId: string; role: 'owner' | 'tenant'; startDate: string; isPrimaryContact: boolean }>({
    personId: '',
    role: 'tenant',
    startDate: new Date().toISOString().slice(0, 10),
    isPrimaryContact: false,
  });

  const fetchEstate = () => {
    setLoading(true);
    Promise.all([
      api.get<any>(`/estates/${estateId}`).then((r) => setEstate(r.data)),
      api.get<any>('/people?limit=500').then((r) => setPeople(r.data || [])),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEstate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estateId]);

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/estates/${estateId}/units`, {
        ...unitForm,
        floor: unitForm.floor ? parseInt(unitForm.floor) : undefined,
      });
      toast({ variant: 'success', title: `Unit ${unitForm.unitNumber} added` });
      setShowAddUnit(false);
      setUnitForm({ unitNumber: '', block: '', floor: '', type: 'apartment' });
      fetchEstate();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not add unit', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddOccupancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!occUnit) return;
    if (!occForm.personId) {
      toast({ variant: 'error', title: 'Pick a person' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/people/${occForm.personId}/occupancies`, {
        unitId: occUnit.id,
        role: occForm.role,
        startDate: occForm.startDate,
        isPrimaryContact: occForm.isPrimaryContact,
      });
      toast({ variant: 'success', title: 'Occupant added' });
      setOccForm({ personId: '', role: 'tenant', startDate: new Date().toISOString().slice(0, 10), isPrimaryContact: false });
      // Re-fetch the estate; `occUnit` is derived from estate state so the
      // drawer's content updates without re-mounting.
      const { data: fresh } = await api.get<any>(`/estates/${estateId}`);
      setEstate(fresh);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not add', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const endOccupancy = async (occ: any) => {
    const personName = occ.person ? `${occ.person.firstName} ${occ.person.lastName}` : 'this occupant';
    // Pass an `action` so the confirm dialog itself stays open with a "Working…"
    // spinner during the API call. Errors are surfaced as a toast and re-thrown
    // so the dialog stays open for retry. Without this the user would see the
    // dialog close instantly while the mutation was still in flight.
    await confirm({
      title: `End ${occ.role} occupancy?`,
      description: `${personName} will be marked as moved out as of today. History is preserved.`,
      confirmText: 'End',
      destructive: true,
      action: async () => {
        try {
          await api.put(`/people/occupancies/${occ.id}/deactivate`);
          toast({ variant: 'success', title: 'Occupancy ended' });
          const { data: fresh } = await api.get<any>(`/estates/${estateId}`);
          setEstate(fresh);
          // `occUnit` is derived from `estate`, so no separate setOccUnit
          // call is needed — the drawer just sees the updated occupancies.
        } catch (err: any) {
          toast({ variant: 'error', title: 'Failed', description: err.message });
          throw err;
        }
      },
    });
  };

  // Partition the bound unit's occupancies into active + historical so the
  // drawer can render them in two clear sections.
  const { active, history } = useMemo(() => {
    const occs = (occUnit?.occupancies ?? []) as any[];
    return {
      active: occs.filter((o) => o.isActive),
      history: occs
        .filter((o) => !o.isActive)
        .sort((a, b) => new Date(b.endDate || b.startDate).getTime() - new Date(a.endDate || a.startDate).getTime()),
    };
  }, [occUnit]);

  // Which role slots are currently free on this unit. The backend enforces
  // one-active-per-role; the UI uses this to prune the role dropdown so the
  // admin can't pick a role that's guaranteed to 409.
  const availableRoles = useMemo<Array<'owner' | 'tenant'>>(() => {
    const hasOwner = active.some((o: any) => o.role === 'owner');
    const hasTenant = active.some((o: any) => o.role === 'tenant');
    return [
      ...(hasOwner ? [] : ['owner' as const]),
      ...(hasTenant ? [] : ['tenant' as const]),
    ];
  }, [active]);

  // Keep occForm.role in sync with what's actually available — otherwise
  // switching units mid-session can leave it pointing at a filled slot.
  useEffect(() => {
    if (availableRoles.length === 0) return;
    if (!availableRoles.includes(occForm.role)) {
      setOccForm((cur) => ({ ...cur, role: availableRoles[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableRoles.join(',')]);

  // Roll-up stats for the header — gives the property manager an at-a-glance
  // sense of the estate before they dive into per-unit rows.
  const stats = useMemo(() => {
    const units = (estate?.units ?? []) as any[];
    let ownerOccupied = 0;
    let rented = 0;
    let vacant = 0;
    for (const u of units) {
      const activeOccs = (u.occupancies ?? []).filter((o: any) => o.isActive);
      const hasTenant = activeOccs.some((o: any) => o.role === 'tenant');
      const hasOwner = activeOccs.some((o: any) => o.role === 'owner');
      if (hasTenant) rented++;
      else if (hasOwner) ownerOccupied++;
      else vacant++;
    }
    return { total: units.length, ownerOccupied, rented, vacant };
  }, [estate]);

  // Filter units by the search field (unit#, block, floor, occupant name).
  const filteredUnits = useMemo(() => {
    const units = (estate?.units ?? []) as any[];
    const q = unitSearch.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) => {
      const haystack = [
        u.unitNumber,
        u.block,
        u.floor != null ? `floor ${u.floor}` : '',
        u.type,
        ...(u.occupancies ?? [])
          .filter((o: any) => o.isActive)
          .map((o: any) => `${o.person?.firstName ?? ''} ${o.person?.lastName ?? ''}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [estate, unitSearch]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (!estate) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-body text-muted-foreground">Estate not found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/estates"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        All estates
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-icon bg-stone-surface">
            <Building2 className="h-6 w-6 text-graphite" />
          </div>
          <div>
            <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
              {estate.name}
            </h1>
            {estate.address && (
              <p className="mt-1 flex items-center gap-1.5 text-body text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {estate.address}
              </p>
            )}
          </div>
        </div>
        <Button onClick={() => setShowAddUnit(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add unit
        </Button>
      </header>

      {!estate.units || estate.units.length === 0 ? (
        <EmptyState
          variant="card"
          icon={Home}
          title="No units yet"
          description="Add units to this estate to start invoicing, linking owners, and tracking visitor passes."
          action={{ label: 'Add unit', onClick: () => setShowAddUnit(true) }}
        />
      ) : (
        <>
          {/* Roll-up stats — read at a glance before drilling into a row. */}
          <div className="grid gap-3 md:grid-cols-4">
            <StatCard label="Total units" value={stats.total} icon={Home} iconClass="text-graphite bg-stone-surface" />
            <StatCard label="Owner-occupied" value={stats.ownerOccupied} icon={KeyRound} iconClass="text-meadow-green bg-meadow-green/10" />
            <StatCard label="Rented" value={stats.rented} icon={Users} iconClass="text-info bg-info/10" />
            <StatCard label="Vacant" value={stats.vacant} icon={Building2} iconClass="text-deep-amber bg-deep-amber/10" />
          </div>

          {/* Toolbar — search + view toggle. */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by unit, block, floor, or occupant…"
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
              />
            </div>
            <ViewToggle value={view} onChange={setView} />
            <p className="text-caption text-muted-foreground ml-auto">
              {filteredUnits.length} of {estate.units.length} unit{estate.units.length === 1 ? '' : 's'}
            </p>
          </div>

          {filteredUnits.length === 0 ? (
            <EmptyState
              variant="card"
              icon={Search}
              title="No matches"
              description={`Nothing matches "${unitSearch}". Clear the search to see all ${estate.units.length} units.`}
            />
          ) : view === 'card' ? (
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              {filteredUnits.map((unit: any) => {
                const activeOccs = (unit.occupancies ?? []).filter((o: any) => o.isActive);
                const owners = activeOccs.filter((o: any) => o.role === 'owner');
                const tenants = activeOccs.filter((o: any) => o.role === 'tenant');
                // Status reflects whether anyone actually lives there. An
                // owner-only unit is "Owner-occupied"; a tenant present means
                // it's "Rented" (regardless of whether the owner is also on
                // record — which they usually are).
                const status =
                  tenants.length > 0
                    ? { label: 'Rented', tone: 'info' as const }
                    : owners.length > 0
                    ? { label: 'Owner-occupied', tone: 'success' as const }
                    : { label: 'Vacant', tone: 'muted' as const };
                return (
                  <Card key={unit.id} className="cursor-pointer transition-shadow hover:shadow-soft" onClick={() => setOccUnitId(unit.id)}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-heading-sm font-medium text-charcoal-primary">
                          Unit {unit.unitNumber}
                        </p>
                        {unit.block && <Badge variant="muted">Block {unit.block}</Badge>}
                      </div>
                      <div className="mt-2 space-y-0.5">
                        {unit.floor != null && (
                          <p className="text-caption text-muted-foreground">Floor {unit.floor}</p>
                        )}
                        <p className="text-caption text-muted-foreground capitalize">{unit.type}</p>
                      </div>
                      <div className="mt-3 space-y-1.5 border-t border-stone-surface pt-3">
                        <Badge variant={status.tone}>{status.label}</Badge>
                        {owners.length === 0 ? (
                          <p className="text-caption text-muted-foreground italic">No owner linked</p>
                        ) : (
                          owners.map((o: any) => (
                            <div key={o.id} className="flex items-center gap-1.5 text-caption">
                              <Badge variant="success">Owner</Badge>
                              <span className="truncate text-graphite">
                                {o.person.firstName} {o.person.lastName}
                              </span>
                            </div>
                          ))
                        )}
                        {tenants.map((t: any) => (
                          <div key={t.id} className="flex items-center gap-1.5 text-caption">
                            <Badge variant="info">Tenant</Badge>
                            <span className="truncate text-graphite">
                              {t.person.firstName} {t.person.lastName}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-1 text-caption font-medium text-ember-orange">
                        Manage occupants
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="px-6 py-3">Unit</th>
                        <th className="px-6 py-3">Block</th>
                        <th className="px-6 py-3">Floor</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3">Owner</th>
                        <th className="px-6 py-3">Tenant</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="w-12 px-6 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-surface">
                      {filteredUnits.map((unit: any) => {
                        const activeOccs = (unit.occupancies ?? []).filter((o: any) => o.isActive);
                        // Multiple owners (joint ownership) and multiple tenants
                        // (flatmates) are real scenarios — the data model allows
                        // them and we surface "+N more" rather than hiding co-
                        // occupants behind a .find() that only returned the first.
                        const owners = activeOccs.filter((o: any) => o.role === 'owner');
                        const tenants = activeOccs.filter((o: any) => o.role === 'tenant');
                        return (
                          <tr
                            key={unit.id}
                            className="cursor-pointer transition-colors hover:bg-stone-surface/40"
                            onClick={() => setOccUnitId(unit.id)}
                          >
                            <td className="px-6 py-3 font-medium text-charcoal-primary">{unit.unitNumber}</td>
                            <td className="px-6 py-3 text-muted-foreground">{unit.block || <span className="text-muted-foreground/50">—</span>}</td>
                            <td className="px-6 py-3 text-muted-foreground">{unit.floor != null ? unit.floor : <span className="text-muted-foreground/50">—</span>}</td>
                            <td className="px-6 py-3 text-muted-foreground capitalize">{unit.type}</td>
                            <td className="px-6 py-3 text-graphite">
                              {owners.length === 0 ? (
                                <span className="text-muted-foreground/60 italic">—</span>
                              ) : (
                                <>
                                  {owners[0].person.firstName} {owners[0].person.lastName}
                                  {owners.length > 1 && (
                                    <span className="ml-1 text-caption text-muted-foreground">+{owners.length - 1}</span>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-6 py-3 text-graphite">
                              {tenants.length === 0 ? (
                                <span className="text-muted-foreground/60 italic">—</span>
                              ) : (
                                <>
                                  {tenants[0].person.firstName} {tenants[0].person.lastName}
                                  {tenants.length > 1 && (
                                    <span className="ml-1 text-caption text-muted-foreground">+{tenants.length - 1}</span>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-6 py-3">
                              {tenants.length > 0 ? <Badge variant="info">Rented</Badge>
                                : owners.length > 0 ? <Badge variant="success">Owner-occupied</Badge>
                                : <Badge variant="muted">Vacant</Badge>}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <Link
                                href={`/admin/units/${unit.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-caption text-ember-orange hover:underline"
                                title="Open unit details"
                              >
                                Details <ArrowRight className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Add-unit drawer */}
      <Drawer open={showAddUnit} onOpenChange={setShowAddUnit}>
        <DrawerContent size="md">
          <form onSubmit={handleAddUnit} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>New unit</DrawerTitle>
              <DrawerDescription>Add a unit to {estate.name}. Block + floor are optional.</DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="unitNumber">Unit number</Label>
                <Input id="unitNumber" value={unitForm.unitNumber} onChange={(e) => setUnitForm({ ...unitForm, unitNumber: e.target.value })} required autoFocus placeholder="e.g. 14A" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="block">Block</Label>
                  <Input id="block" value={unitForm.block} onChange={(e) => setUnitForm({ ...unitForm, block: e.target.value })} placeholder="e.g. B" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="floor">Floor</Label>
                  <Input id="floor" type="number" value={unitForm.floor} onChange={(e) => setUnitForm({ ...unitForm, floor: e.target.value })} placeholder="e.g. 3" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="utype">Type</Label>
                <select
                  id="utype"
                  value={unitForm.type}
                  onChange={(e) => setUnitForm({ ...unitForm, type: e.target.value })}
                  className="flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <option value="apartment">Apartment</option>
                  <option value="townhouse">Townhouse</option>
                  <option value="house">House</option>
                  <option value="duplex">Duplex</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" loading={submitting}>{submitting ? 'Saving…' : 'Create unit'}</Button>
              <DrawerClose asChild><Button type="button" variant="secondary">Cancel</Button></DrawerClose>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      {/* Manage-occupants drawer */}
      <Drawer open={!!occUnit} onOpenChange={(o) => !o && setOccUnitId(null)}>
        <DrawerContent size="lg">
          <DrawerHeader>
            <DrawerTitle>Unit {occUnit?.unitNumber} occupants</DrawerTitle>
            <DrawerDescription>
              Manage active occupancies, end one when someone moves out, and review the full history.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-6">
            {/* Active occupancies */}
            <section>
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-2">Active</h3>
              {active.length === 0 ? (
                <p className="rounded-lg bg-stone-surface/60 px-3 py-2.5 text-caption text-muted-foreground">
                  No active occupancies. Add an owner or tenant below to start.
                </p>
              ) : (
                <ul className="space-y-2">
                  {active.map((occ) => (
                    <li key={occ.id} className="flex items-center justify-between rounded-lg shadow-inset-stone px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Badge variant={occ.role === 'owner' ? 'success' : 'info'}>{occ.role}</Badge>
                        <div>
                          <Link
                            href={`/admin/people/${occ.person.id}`}
                            className="text-sm font-medium text-charcoal-primary hover:text-ember-orange transition-colors"
                          >
                            {occ.person.firstName} {occ.person.lastName}
                          </Link>
                          {occ.isPrimaryContact && (
                            <span className="ml-2 text-caption text-ember-orange">primary contact</span>
                          )}
                          <p className="text-caption text-muted-foreground">
                            Since {formatDate(occ.startDate)}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => endOccupancy(occ)} title="End occupancy">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Add occupancy form — pruned to the slots the unit actually has
                room for. When both owner and tenant are already on record,
                we show a notice instead so the admin doesn't try (and fail)
                to add a third. Person.type ≠ unit role: a person whose global
                type is "owner" can still be added as a TENANT here (e.g. an
                owner renting another unit they don't own). */}
            <section>
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-2">Add occupant</h3>
              {availableRoles.length === 0 ? (
                <p className="rounded-lg bg-stone-surface/60 px-3 py-2.5 text-caption text-muted-foreground">
                  Both owner and tenant slots are filled. End one of the active occupancies above before adding a new occupant.
                </p>
              ) : (
                <form onSubmit={handleAddOccupancy} className="space-y-3 rounded-lg shadow-inset-stone p-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="opperson">Person</Label>
                    <select
                      id="opperson"
                      value={occForm.personId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const p = people.find((x) => x.id === pid);
                        // Auto-suggest a role from the person's global type
                        // ONLY when that role is actually available on this
                        // unit — otherwise fall back to whatever slot is
                        // open. This handles "owner type, but the only free
                        // slot is tenant" cleanly without forcing the admin
                        // to re-pick.
                        const suggested = p?.type === 'tenant' ? 'tenant' : 'owner';
                        const role = availableRoles.includes(suggested as any)
                          ? (suggested as 'owner' | 'tenant')
                          : availableRoles[0];
                        setOccForm({ ...occForm, personId: pid, role });
                      }}
                      className="flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <option value="">— select —</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}{p.type ? ` (${p.type})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-caption text-muted-foreground">
                      Not listed? Add them via Management → People first.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="oprole">Role on this unit</Label>
                      <select
                        id="oprole"
                        value={occForm.role}
                        onChange={(e) => setOccForm({ ...occForm, role: e.target.value as 'owner' | 'tenant' })}
                        className="flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {availableRoles.map((r) => (
                          <option key={r} value={r}>
                            {r === 'owner' ? 'Owner' : 'Tenant'}
                          </option>
                        ))}
                      </select>
                      {availableRoles.length === 1 && (
                        <p className="text-caption text-muted-foreground">
                          The other slot is already taken on this unit.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="opstart">Start date</Label>
                      <Input id="opstart" type="date" value={occForm.startDate} onChange={(e) => setOccForm({ ...occForm, startDate: e.target.value })} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-caption text-graphite">
                    <input
                      type="checkbox"
                      checked={occForm.isPrimaryContact}
                      onChange={(e) => setOccForm({ ...occForm, isPrimaryContact: e.target.checked })}
                      className="h-4 w-4 accent-ember-orange"
                    />
                    Primary contact for the unit (receives invoices, visitor pass alerts)
                  </label>
                  <Button type="submit" size="sm" loading={submitting}>
                    {!submitting && <Plus className="mr-1 h-3.5 w-3.5" />}
                    {submitting ? 'Adding…' : 'Add occupancy'}
                  </Button>
                </form>
              )}
            </section>

            {/* History */}
            <section>
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-2 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                History
              </h3>
              {history.length === 0 ? (
                <p className="rounded-lg bg-stone-surface/60 px-3 py-2.5 text-caption text-muted-foreground">
                  No past occupancies yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((occ) => (
                    <li key={occ.id} className={cn('flex items-center justify-between rounded-lg bg-stone-surface/40 px-3 py-2 text-caption')}>
                      <div className="flex items-center gap-2">
                        <Badge variant="muted">{occ.role}</Badge>
                        <Link
                          href={`/admin/people/${occ.person.id}`}
                          className="text-graphite hover:text-ember-orange transition-colors"
                        >
                          {occ.person.firstName} {occ.person.lastName}
                        </Link>
                      </div>
                      <span className="text-muted-foreground">
                        {formatDate(occ.startDate)} – {occ.endDate ? formatDate(occ.endDate) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </DrawerBody>
          <DrawerFooter>
            <DrawerClose asChild><Button variant="secondary">Close</Button></DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
