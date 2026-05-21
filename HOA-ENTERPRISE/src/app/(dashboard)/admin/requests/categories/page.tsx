'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

type Category = {
  id: string;
  name: string;
  description?: string;
  defaultPriority: string;
  slaResolveHours: number | null;
  assignToRoles: string[];
  isActive: boolean;
};

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const ROLE_OPTIONS = ['property_manager', 'hoa_admin', 'finance_officer', 'communications_manager', 'gate_security'];

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', defaultPriority: 'normal', slaResolveHours: '24', assignToRoles: ['property_manager'] });

  const load = () => {
    setLoading(true);
    api.get<any>('/requests/categories?all=true')
      .then((r) => setCats(r.data || []))
      .catch((err) => toast({ variant: 'error', title: 'Failed', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggleRole = (r: string) => {
    setForm((f) => ({ ...f, assignToRoles: f.assignToRoles.includes(r) ? f.assignToRoles.filter((x) => x !== r) : [...f.assignToRoles, r] }));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/requests/categories', {
        name: form.name,
        description: form.description || undefined,
        defaultPriority: form.defaultPriority,
        slaResolveHours: form.slaResolveHours ? Number(form.slaResolveHours) : undefined,
        assignToRoles: form.assignToRoles,
      });
      setShowNew(false);
      setForm({ name: '', description: '', defaultPriority: 'normal', slaResolveHours: '24', assignToRoles: ['property_manager'] });
      load();
      toast({ variant: 'success', title: 'Category created' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const toggleActive = async (c: Category) => {
    try {
      await api.put(`/requests/categories/${c.id}`, { isActive: !c.isActive });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/requests" className="inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-charcoal-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to queue
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Request categories</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Per-HOA taxonomy for resident requests. SLA + auto-routing rules live here.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus className="mr-1.5 h-4 w-4" />New category</Button>
      </header>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : cats.length === 0 ? (
          <p className="p-10 text-center text-caption text-muted-foreground">No categories yet. Create one to start accepting requests.</p>
        ) : (
          <ul className="divide-y divide-stone-surface">
            {cats.map((c) => (
              <li key={c.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-charcoal-primary">{c.name}</span>
                    <Badge variant={c.defaultPriority === 'urgent' ? 'destructive' : c.defaultPriority === 'high' ? 'warning' : 'muted'}>{c.defaultPriority}</Badge>
                    {c.slaResolveHours && <Badge variant="info">{c.slaResolveHours}h SLA</Badge>}
                    {!c.isActive && <Badge variant="muted">inactive</Badge>}
                  </div>
                  {c.description && <p className="text-caption text-muted-foreground mt-1">{c.description}</p>}
                  {c.assignToRoles.length > 0 && (
                    <p className="text-caption text-muted-foreground mt-0.5">Routes to: {c.assignToRoles.join(', ')}</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(c)}>
                  {c.isActive ? 'Disable' : 'Enable'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      <Drawer open={showNew} onOpenChange={setShowNew}>
        <DrawerContent size="md">
          <form onSubmit={create} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>New category</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cn">Name</Label>
                <Input id="cn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Maintenance" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cd">Description (optional)</Label>
                <Input id="cd" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cp">Default priority</Label>
                  <select id="cp" className={selectClass} value={form.defaultPriority} onChange={(e) => setForm({ ...form, defaultPriority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="csla">SLA (hours)</Label>
                  <Input id="csla" type="number" min="1" value={form.slaResolveHours} onChange={(e) => setForm({ ...form, slaResolveHours: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Route to roles</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_OPTIONS.map((r) => (
                    <button key={r} type="button" onClick={() => toggleRole(r)}
                      className={cn('rounded-pill px-2.5 py-1 text-[11px] font-medium border transition-colors',
                        form.assignToRoles.includes(r) ? 'border-ember-orange bg-ember-orange/10 text-ember-orange' : 'border-stone-surface bg-card text-graphite')}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={busy}>Create</Button>
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
