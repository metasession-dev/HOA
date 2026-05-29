'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, MapPin, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { ViewToggle, useViewMode } from '@/components/ui/view-toggle';

export default function EstatesPage() {
  const [estates, setEstates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', totalUnits: 0 });

  const fetchEstates = () => {
    api
      .get<any>('/estates')
      .then((res) => setEstates(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEstates();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/estates', form);
      toast({ variant: 'success', title: 'Estate created', description: form.name });
      setShowCreate(false);
      setForm({ name: '', address: '', totalUnits: 0 });
      fetchEstates();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not create estate', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const [view, setView] = useViewMode('estates', 'card');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Estates</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Manage your estates and their units.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
          {/* An enterprise has a single estate — the one it signed up with.
              The "Add estate" action only appears until that estate exists. */}
          {!loading && estates.length === 0 && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add estate
            </Button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : estates.length === 0 ? (
        <EmptyState
          variant="card"
          icon={Building2}
          title="No estates yet"
          description="Create your first estate to start adding units and people."
          action={{ label: 'Add estate', onClick: () => setShowCreate(true) }}
        />
      ) : view === 'card' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {estates.map((estate: any) => (
            <Link key={estate.id} href={`/admin/estates/${estate.id}`} className="group">
              <Card className="h-full transition-shadow duration-200 hover:shadow-soft">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-icon bg-stone-surface">
                      <Building2 className="h-[18px] w-[18px] text-graphite" />
                    </div>
                    <Badge variant="muted">{estate._count?.units || estate.totalUnits} units</Badge>
                  </div>
                  <h3 className="mt-4 text-heading-sm font-display font-medium text-charcoal-primary truncate">
                    {estate.name}
                  </h3>
                  {estate.address && (
                    <p className="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{estate.address}</span>
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-1 text-caption font-medium text-ember-orange opacity-0 transition-opacity group-hover:opacity-100">
                    Open
                    <ChevronRight className="h-3 w-3" />
                  </div>
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
                    <th className="px-6 py-3">Estate</th>
                    <th className="px-6 py-3">Address</th>
                    <th className="px-6 py-3">Units</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-surface">
                  {estates.map((estate: any) => (
                    <tr key={estate.id} className="group transition-colors hover:bg-stone-surface/40">
                      <td className="px-6 py-3">
                        <Link href={`/admin/estates/${estate.id}`} className="font-medium text-charcoal-primary hover:underline">
                          {estate.name}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {estate.address || <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="muted">{estate._count?.units || estate.totalUnits}</Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link href={`/admin/estates/${estate.id}`} className="inline-flex items-center gap-1 text-caption font-medium text-ember-orange opacity-0 transition-opacity group-hover:opacity-100">
                          Open <ChevronRight className="h-3 w-3" />
                        </Link>
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
              <DrawerTitle>New estate</DrawerTitle>
              <DrawerDescription>
                Groups units, residents, and amenities under one community.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Estate name</Label>
                <Input
                  id="name"
                  placeholder="Sunset Estate"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="123 Main St"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="totalUnits">Total units</Label>
                <Input
                  id="totalUnits"
                  type="number"
                  min={0}
                  placeholder="e.g. 120"
                  value={form.totalUnits || ''}
                  onChange={(e) => setForm({ ...form, totalUnits: parseInt(e.target.value) || 0 })}
                />
                <p className="text-caption text-muted-foreground">
                  Used as a sanity check when bulk-importing units; you can change it later.
                </p>
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Create estate'}
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
