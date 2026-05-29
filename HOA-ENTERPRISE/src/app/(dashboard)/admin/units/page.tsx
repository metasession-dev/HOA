'use client';

/**
 * Org-level Units page. An enterprise has a single estate, so this is the
 * primary place to manage every unit: see ownership + occupancy at a glance,
 * add a unit with the right owner/tenant workflow, and bulk-import from a
 * spreadsheet.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Home, Plus, Upload, Search, KeyRound, Users, Building2, ArrowRight, AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ViewToggle, useViewMode } from '@/components/ui/view-toggle';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

const UNIT_TYPES = ['apartment', 'townhouse', 'house', 'duplex', 'commercial'] as const;

type OccupancyMode = 'owner_occupied' | 'rented' | 'vacant';

function unitStatus(u: any): { label: string; tone: 'success' | 'info' | 'muted' | 'warning' } {
  const occs = (u.occupancies ?? []).filter((o: any) => o.isActive);
  const hasOwner = (u.ownerships ?? []).some((o: any) => o.isActive);
  const tenant = occs.find((o: any) => o.role === 'tenant');
  const ownerOcc = occs.find((o: any) => o.role === 'owner');
  if (!hasOwner) return { label: 'No owner', tone: 'warning' };
  if (tenant) return { label: 'Rented', tone: 'info' };
  if (ownerOcc) return { label: 'Owner-occupied', tone: 'success' };
  return { label: 'Vacant', tone: 'muted' };
}

function activeOwnerName(u: any): string | null {
  const o = (u.ownerships ?? []).find((x: any) => x.isActive);
  return o?.person ? `${o.person.firstName} ${o.person.lastName}` : null;
}
function activeOccupantName(u: any): string | null {
  const o = (u.occupancies ?? []).find((x: any) => x.isActive);
  return o?.person ? `${o.person.firstName} ${o.person.lastName}` : null;
}

export default function UnitsPage() {
  const [units, setUnits] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [estates, setEstates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useViewMode('units', 'table');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      api.get<any>('/units?limit=1000').then((r) => setUnits(r.data || [])),
      api.get<any>('/people?limit=1000').then((r) => setPeople(r.data || [])),
      api.get<any>('/estates').then((r) => setEstates(r.data || [])),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) => {
      const hay = [
        u.unitNumber, u.block, u.street, activeOwnerName(u), activeOccupantName(u), u.estate?.name,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [units, search]);

  const stats = useMemo(() => {
    let ownerOccupied = 0, rented = 0, vacant = 0, noOwner = 0;
    for (const u of units) {
      const s = unitStatus(u);
      if (s.label === 'No owner') noOwner++;
      else if (s.label === 'Rented') rented++;
      else if (s.label === 'Owner-occupied') ownerOccupied++;
      else vacant++;
    }
    return { total: units.length, ownerOccupied, rented, vacant, noOwner };
  }, [units]);

  const defaultEstateId = estates[0]?.id ?? '';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Units</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Every unit in your estate — ownership, occupancy and household at a glance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowBulk(true)} disabled={!defaultEstateId}>
            <Upload className="mr-1.5 h-4 w-4" />
            Bulk upload
          </Button>
          <Button onClick={() => setShowAdd(true)} disabled={!defaultEstateId}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add unit
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : units.length === 0 ? (
        <EmptyState
          variant="card"
          icon={Home}
          title="No units yet"
          description="Add your first unit, or bulk-import the whole estate from a CSV/Excel sheet. Every unit gets an owner, and you can record the active occupant (owner or tenant) plus household members."
          action={defaultEstateId ? { label: 'Add unit', onClick: () => setShowAdd(true) } : undefined}
          secondaryAction={defaultEstateId ? { label: 'Bulk upload', onClick: () => setShowBulk(true), variant: 'secondary' } : undefined}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total units" value={stats.total} icon={Home} />
            <StatCard label="Owner-occupied" value={stats.ownerOccupied} icon={KeyRound} iconClass="text-meadow-green bg-meadow-green/10" />
            <StatCard label="Rented" value={stats.rented} icon={Users} iconClass="text-info bg-info/10" />
            <StatCard
              label={stats.noOwner > 0 ? 'Missing owner' : 'Vacant'}
              value={stats.noOwner > 0 ? stats.noOwner : stats.vacant}
              icon={stats.noOwner > 0 ? AlertTriangle : Building2}
              iconClass={stats.noOwner > 0 ? 'text-coral-red bg-coral-red/10' : undefined}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search unit, block, street, owner or occupant…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="muted">{filtered.length} of {units.length}</Badge>
            <ViewToggle value={view} onChange={setView} />
          </div>

          {view === 'card' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((u) => {
                const s = unitStatus(u);
                return (
                  <Link key={u.id} href={`/admin/units/${u.id}`}>
                    <Card className="h-full transition-shadow hover:shadow-card-hover">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-heading-sm font-medium text-charcoal-primary">
                            Unit {u.unitNumber}
                          </h3>
                          <Badge variant={s.tone}>{s.label}</Badge>
                        </div>
                        <p className="mt-1 text-caption text-muted-foreground">
                          {[u.block && `Block ${u.block}`, u.street, u.floor != null && `Floor ${u.floor}`]
                            .filter(Boolean).join(' · ') || u.type}
                        </p>
                        <div className="mt-3 space-y-1 text-caption">
                          <p className="text-muted-foreground">
                            Owner: <span className="text-graphite">{activeOwnerName(u) ?? '—'}</span>
                          </p>
                          <p className="text-muted-foreground">
                            Occupant: <span className="text-graphite">{activeOccupantName(u) ?? '—'}</span>
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-surface text-left text-caption uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-3 font-medium">Unit</th>
                      <th className="px-5 py-3 font-medium">Block / Street</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium">Owner</th>
                      <th className="px-5 py-3 font-medium">Occupant</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-surface">
                    {filtered.map((u) => {
                      const s = unitStatus(u);
                      return (
                        <tr key={u.id} className="hover:bg-stone-surface/40">
                          <td className="px-5 py-3 font-medium text-graphite">{u.unitNumber}</td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {[u.block, u.street].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="px-5 py-3 capitalize text-muted-foreground">{u.type}</td>
                          <td className="px-5 py-3 text-graphite">{activeOwnerName(u) ?? <span className="text-coral-red">—</span>}</td>
                          <td className="px-5 py-3 text-graphite">{activeOccupantName(u) ?? '—'}</td>
                          <td className="px-5 py-3"><Badge variant={s.tone}>{s.label}</Badge></td>
                          <td className="px-5 py-3 text-right">
                            <Link
                              href={`/admin/units/${u.id}`}
                              className="inline-flex items-center gap-1 text-caption font-medium text-ember-orange hover:underline"
                            >
                              Details <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <AddUnitDrawer
        open={showAdd}
        onOpenChange={setShowAdd}
        estates={estates}
        defaultEstateId={defaultEstateId}
        people={people}
        onDone={fetchAll}
      />
      <BulkUploadDrawer
        open={showBulk}
        onOpenChange={setShowBulk}
        estates={estates}
        defaultEstateId={defaultEstateId}
        onDone={fetchAll}
      />
    </div>
  );
}

// ==================== Add unit (with owner/tenant workflow) ====================

function AddUnitDrawer({
  open, onOpenChange, estates, defaultEstateId, people, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estates: any[];
  defaultEstateId: string;
  people: any[];
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [estateId, setEstateId] = useState(defaultEstateId);
  const [form, setForm] = useState({ unitNumber: '', block: '', street: '', floor: '', type: 'apartment' });
  const [ownerId, setOwnerId] = useState('');
  const [mode, setMode] = useState<OccupancyMode>('owner_occupied');
  const [tenantId, setTenantId] = useState('');
  const [householdSize, setHouseholdSize] = useState('');

  useEffect(() => { if (open) setEstateId(defaultEstateId); }, [open, defaultEstateId]);

  const reset = () => {
    setForm({ unitNumber: '', block: '', street: '', floor: '', type: 'apartment' });
    setOwnerId(''); setTenantId(''); setMode('owner_occupied'); setHouseholdSize('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId) {
      toast({ variant: 'error', title: 'Owner required', description: 'Every unit must have an owner. Pick the titled owner.' });
      return;
    }
    if (mode === 'rented' && !tenantId) {
      toast({ variant: 'error', title: 'Tenant required', description: 'Select the tenant occupying this unit, or change the occupancy option.' });
      return;
    }
    setSubmitting(true);
    try {
      // 1. Create the unit.
      const created: any = await api.post(`/estates/${estateId}/units`, {
        unitNumber: form.unitNumber.trim(),
        block: form.block.trim() || undefined,
        street: form.street.trim() || undefined,
        floor: form.floor === '' ? undefined : Number(form.floor),
        type: form.type,
      });
      const unitId = created?.data?.id;
      if (!unitId) throw new Error('Unit was not created');

      // 2. Record the owner (title chain) — initial acquisition.
      await api.post(`/units/${unitId}/ownerships`, { personId: ownerId, acquisitionMethod: 'initial' });

      // 3. Record the active occupant, per the chosen workflow.
      const startDate = new Date().toISOString();
      const hh = householdSize === '' ? undefined : Number(householdSize);
      if (mode === 'owner_occupied') {
        await api.post(`/people/${ownerId}/occupancies`, {
          unitId, role: 'owner', startDate, isPrimaryContact: true, householdSize: hh,
        });
      } else if (mode === 'rented') {
        await api.post(`/people/${tenantId}/occupancies`, {
          unitId, role: 'tenant', startDate, isPrimaryContact: true, householdSize: hh,
        });
      }

      toast({ variant: 'success', title: `Unit ${form.unitNumber} added` });
      onOpenChange(false);
      reset();
      onDone();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not add unit', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const personLabel = (p: any) => `${p.firstName} ${p.lastName}${p.email ? ` · ${p.email}` : ''}`;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="lg">
        <form onSubmit={submit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle>New unit</DrawerTitle>
            <DrawerDescription>
              Add a unit and set up its owner and occupant in one step. Every unit must have an owner.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-5">
            {estates.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="estate">Estate</Label>
                <select id="estate" className={selectClass} value={estateId} onChange={(e) => setEstateId(e.target.value)}>
                  {estates.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="unitNumber">Unit number</Label>
                <Input id="unitNumber" value={form.unitNumber} required autoFocus
                  onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">Type</Label>
                <select id="type" className={selectClass} value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {UNIT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="block">Block</Label>
                <Input id="block" value={form.block} placeholder="optional"
                  onChange={(e) => setForm({ ...form, block: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="street">Street / lane / close</Label>
                <Input id="street" value={form.street} placeholder="optional"
                  onChange={(e) => setForm({ ...form, street: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="floor">Floor</Label>
                <Input id="floor" type="number" value={form.floor} placeholder="optional"
                  onChange={(e) => setForm({ ...form, floor: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="owner">Owner (titled)</Label>
              <select id="owner" className={selectClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required>
                <option value="">Select the owner…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}
              </select>
              <p className="text-caption text-muted-foreground">
                Not listed? <Link href="/admin/people" className="text-ember-orange hover:underline">Add the person</Link> first, then come back.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Who lives here?</Label>
              <div className="space-y-2">
                {([
                  { id: 'owner_occupied', title: 'Owner occupies it', hint: 'The owner lives in the unit (owner-occupier).' },
                  { id: 'rented', title: 'Rented to a tenant', hint: 'The owner rents it out; a separate tenant is the active occupant.' },
                  { id: 'vacant', title: 'No occupant yet', hint: 'Record the owner now, add the occupant later.' },
                ] as const).map((opt) => (
                  <label key={opt.id} className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    mode === opt.id ? 'border-ember-orange bg-ember-orange/5' : 'border-stone-surface hover:bg-stone-surface/50',
                  )}>
                    <input type="radio" name="occmode" className="mt-1" checked={mode === opt.id}
                      onChange={() => setMode(opt.id)} />
                    <div>
                      <p className="text-sm font-medium text-charcoal-primary">{opt.title}</p>
                      <p className="text-caption text-muted-foreground">{opt.hint}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {mode === 'rented' && (
              <div className="space-y-1.5">
                <Label htmlFor="tenant">Tenant</Label>
                <select id="tenant" className={selectClass} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                  <option value="">Select the tenant…</option>
                  {people.filter((p) => p.id !== ownerId).map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}
                </select>
              </div>
            )}

            {mode !== 'vacant' && (
              <div className="space-y-1.5">
                <Label htmlFor="hh">Household size (optional)</Label>
                <Input id="hh" type="number" min={1} value={householdSize} placeholder="e.g. 4 (incl. family)"
                  onChange={(e) => setHouseholdSize(e.target.value)} />
                <p className="text-caption text-muted-foreground">
                  You can list individual household members on the unit page afterwards.
                </p>
              </div>
            )}
          </DrawerBody>
          <DrawerFooter>
            <Button type="submit" loading={submitting}>{submitting ? 'Saving…' : 'Add unit'}</Button>
            <DrawerClose asChild><Button type="button" variant="secondary">Cancel</Button></DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

// ==================== Bulk upload (CSV / Excel) ====================

type BulkRow = { unitNumber?: string; block?: string; street?: string; floor?: string | number; type?: string; ownerEmail?: string };

function BulkUploadDrawer({
  open, onOpenChange, estates, defaultEstateId, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estates: any[];
  defaultEstateId: string;
  onDone: () => void;
}) {
  const [estateId, setEstateId] = useState(defaultEstateId);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => { if (open) { setEstateId(defaultEstateId); setRows([]); setFileName(''); setParseError(''); setResult(null); } }, [open, defaultEstateId]);

  const onFile = async (file: File) => {
    setParseError('');
    setResult(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      // Map common header variants to our row shape (case/space-insensitive).
      const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
      const mapped: BulkRow[] = json.map((raw) => {
        const r: Record<string, any> = {};
        for (const key of Object.keys(raw)) r[norm(key)] = raw[key];
        return {
          unitNumber: String(r.unitnumber ?? r.unit ?? r.number ?? '').trim(),
          block: String(r.block ?? '').trim(),
          street: String(r.street ?? r.lane ?? r.close ?? '').trim(),
          floor: r.floor === '' || r.floor == null ? undefined : r.floor,
          type: String(r.type ?? '').trim().toLowerCase() || undefined,
          ownerEmail: String(r.owneremail ?? r.owner ?? r.email ?? '').trim() || undefined,
        };
      }).filter((r) => r.unitNumber);
      if (mapped.length === 0) {
        setParseError('No rows with a unit number found. Make sure the first row is a header with a "unitNumber" column.');
      }
      setRows(mapped);
    } catch (err: any) {
      setParseError(err?.message || 'Could not parse the file.');
      setRows([]);
    }
  };

  const submit = async () => {
    if (rows.length === 0) return;
    setSubmitting(true);
    try {
      const res: any = await api.post(`/estates/${estateId}/units/bulk`, { rows });
      setResult(res.data);
      toast({
        variant: res.data.failed > 0 ? 'warning' : 'success',
        title: `Imported ${res.data.succeeded}/${res.data.total} units`,
        description: res.data.failed > 0 ? `${res.data.failed} row(s) had errors.` : undefined,
      });
      onDone();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Import failed', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="lg">
        <div className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle>Bulk upload units</DrawerTitle>
            <DrawerDescription>
              Upload a CSV or Excel sheet. Columns: <strong>unitNumber</strong> (required), block, street, floor, type, ownerEmail.
              Owners are linked when the email matches an existing person.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            {estates.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="bulkEstate">Estate</Label>
                <select id="bulkEstate" className={selectClass} value={estateId} onChange={(e) => setEstateId(e.target.value)}>
                  {estates.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-surface p-8 text-center transition-colors hover:bg-stone-surface/40">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-graphite">
                {fileName || 'Click to choose a .csv, .xlsx or .xls file'}
              </span>
              <span className="text-caption text-muted-foreground">Parsed in your browser — nothing is uploaded until you confirm.</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
              />
            </label>

            {parseError && (
              <p className="rounded-lg bg-coral-red/10 px-3 py-2 text-caption text-coral-red">{parseError}</p>
            )}

            {rows.length > 0 && !result && (
              <div>
                <p className="mb-2 text-caption text-muted-foreground">{rows.length} unit(s) ready to import — preview:</p>
                <Card>
                  <CardContent className="max-h-64 overflow-auto p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-surface text-left text-caption uppercase text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Unit</th>
                          <th className="px-3 py-2 font-medium">Block</th>
                          <th className="px-3 py-2 font-medium">Street</th>
                          <th className="px-3 py-2 font-medium">Floor</th>
                          <th className="px-3 py-2 font-medium">Owner email</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-surface">
                        {rows.slice(0, 100).map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 text-graphite">{r.unitNumber}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.block || '—'}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.street || '—'}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.floor ?? '—'}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.ownerEmail || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
                {rows.length > 100 && <p className="mt-1 text-caption text-muted-foreground">Showing first 100 of {rows.length}.</p>}
              </div>
            )}

            {result && (
              <div className="space-y-2">
                <div className="flex gap-3">
                  <Badge variant="success">{result.succeeded} created</Badge>
                  {result.failed > 0 && <Badge variant="destructive">{result.failed} failed</Badge>}
                </div>
                {result.failed > 0 && (
                  <Card>
                    <CardContent className="max-h-48 overflow-auto p-0">
                      <ul className="divide-y divide-stone-surface text-sm">
                        {result.results.filter((r: any) => !r.ok).map((r: any) => (
                          <li key={r.row} className="px-3 py-1.5">
                            <span className="text-graphite">Row {r.row}{r.unitNumber ? ` (${r.unitNumber})` : ''}: </span>
                            <span className="text-coral-red">{r.error}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </DrawerBody>
          <DrawerFooter>
            {result ? (
              <DrawerClose asChild><Button type="button">Done</Button></DrawerClose>
            ) : (
              <>
                <Button type="button" onClick={submit} loading={submitting} disabled={rows.length === 0}>
                  {submitting ? 'Importing…' : `Import ${rows.length || ''} unit${rows.length === 1 ? '' : 's'}`}
                </Button>
                <DrawerClose asChild><Button type="button" variant="secondary">Cancel</Button></DrawerClose>
              </>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
