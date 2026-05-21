'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

type Form = {
  name: string;
  displayName: string;
  description: string;
  permissions: string[];
  defaultApprovalLimit: string;
};

const blank = (): Form => ({ name: '', displayName: '', description: '', permissions: [], defaultApprovalLimit: '' });

export default function CustomRolesPage() {
  const confirm = useConfirm();
  const [roles, setRoles] = useState<any[]>([]);
  const [permsByModule, setPermsByModule] = useState<Record<string, Array<{ key: string; description: string }>>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Form>(blank());
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<any>('/team/custom-roles').then((r) => setRoles(r.data || [])),
      api.get<any>('/team/permissions').then((r) => setPermsByModule(r.data?.byModule || {})),
    ]).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing({}); setForm(blank()); };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      name: r.name,
      displayName: r.displayName,
      description: r.description ?? '',
      permissions: r.permissions ?? [],
      defaultApprovalLimit: r.defaultApprovalLimit?.toString() ?? '',
    });
  };

  const togglePerm = (key: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
    }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.displayName.trim()) return toast({ variant: 'error', title: 'Name + display name required' });
    if (form.permissions.length === 0) return toast({ variant: 'error', title: 'Pick at least one permission' });
    setBusy(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        displayName: form.displayName.trim(),
        description: form.description || undefined,
        permissions: form.permissions,
        defaultApprovalLimit: form.defaultApprovalLimit ? Number(form.defaultApprovalLimit) : undefined,
      };
      if (editing?.id) {
        await api.put(`/team/custom-roles/${editing.id}`, payload);
        toast({ variant: 'success', title: 'Custom role updated' });
      } else {
        await api.post('/team/custom-roles', payload);
        toast({ variant: 'success', title: 'Custom role created' });
      }
      setEditing(null); load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally { setBusy(false); }
  };

  const remove = async (r: any) => {
    const ok = await confirm({
      title: `Deactivate "${r.displayName}"?`,
      description: r.assignedCount > 0
        ? `${r.assignedCount} user(s) still have this role — revoke them first.`
        : 'The role is soft-deleted.',
      confirmText: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/team/custom-roles/${r.id}`);
      toast({ variant: 'success', title: 'Deactivated' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/team" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Team
      </Link>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Custom roles</h1>
          <p className="mt-1 text-body text-muted-foreground">Compose roles from the permission catalog. Apply per-user limits and unit scoping at assignment.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />New custom role</Button>
      </header>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : roles.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-body text-charcoal-primary font-medium">No custom roles</p>
            <p className="text-caption text-muted-foreground">Compose your first role (e.g. "Block A managing agent").</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-surface">
            {roles.map((r) => (
              <div key={r.id} className="p-5 flex items-start justify-between gap-3 hover:bg-stone-surface/30">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openEdit(r)}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-charcoal-primary">{r.displayName}</p>
                    <Badge variant="muted">{r.name}</Badge>
                    {!r.isActive && <Badge variant="muted">inactive</Badge>}
                  </div>
                  {r.description && <p className="text-caption text-muted-foreground mt-0.5">{r.description}</p>}
                  <p className="text-caption text-muted-foreground mt-1">
                    {r.permissions.length} permission(s) · {r.assignedCount} assigned
                    {r.defaultApprovalLimit && ` · default limit R ${Number(r.defaultApprovalLimit).toLocaleString()}`}
                  </p>
                </div>
                <button onClick={() => remove(r)} className="text-coral-red/70 hover:text-coral-red"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>

      <Drawer open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DrawerContent size="lg">
          <form onSubmit={save} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>{editing?.id ? 'Edit custom role' : 'New custom role'}</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Name (slug) <span className="text-coral-red">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="block_a_agent" disabled={!!editing?.id} />
                </div>
                <div className="space-y-1.5">
                  <Label>Display name <span className="text-coral-red">*</span></Label>
                  <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required placeholder="Block A managing agent" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </div>
              <div className="space-y-1.5">
                <Label>Default approval limit (R)</Label>
                <Input type="number" min={0} step={0.01} value={form.defaultApprovalLimit} onChange={(e) => setForm({ ...form, defaultApprovalLimit: e.target.value })} placeholder="optional" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Permissions <span className="text-coral-red">*</span></Label>
                  <p className="text-caption text-muted-foreground">{form.permissions.length} selected</p>
                </div>
                {Object.entries(permsByModule).map(([mod, perms]) => (
                  <div key={mod} className="rounded-lg bg-stone-surface/50 p-3">
                    <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground mb-2">{mod}</p>
                    <div className="grid gap-1.5 md:grid-cols-2">
                      {perms.map((p) => (
                        <label key={p.key} className="flex items-start gap-2 text-xs text-graphite cursor-pointer">
                          <input type="checkbox" checked={form.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} className="mt-0.5" />
                          <span>
                            <span className="font-mono text-[11px] text-muted-foreground block">{p.key}</span>
                            {p.description}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save role'}</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
