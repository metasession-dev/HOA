'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2, ChevronDown, ChevronRight, ShieldCheck, Lock } from 'lucide-react';
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

// Slugify a display name into a role key: "Block A managing agent" -> "block_a_managing_agent".
function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Humanize a permission slug like "financial.invoices.view" -> "Invoices · View".
function humanizePerm(p: string): { module: string; label: string } {
  const parts = p.split('.');
  const module = parts[0] || 'other';
  const rest = parts.slice(1).map((s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  return { module, label: rest.join(' · ') || p };
}

export default function RolesPermissionsPage() {
  const confirm = useConfirm();
  const [roles, setRoles] = useState<any[]>([]);
  const [systemRoles, setSystemRoles] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
      api.get<any>('/team/system-roles').then((r) => setSystemRoles(r.data?.roles || [])).catch(() => {}),
    ]).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggleExpanded = (role: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });

  // Every role name already in use (custom + built-in system roles), so an
  // auto-generated slug never collides with an existing one.
  const takenNames = useMemo(() => {
    const set = new Set<string>();
    roles.forEach((r) => r?.name && set.add(String(r.name).toLowerCase()));
    systemRoles.forEach((r) => r?.role && set.add(String(r.role).toLowerCase()));
    return set;
  }, [roles, systemRoles]);

  // Derive a unique slug from the display name, suffixing _2, _3, … on collision.
  const uniqueSlug = (displayName: string): string => {
    const base = slugify(displayName);
    if (!base) return '';
    if (!takenNames.has(base)) return base;
    let i = 2;
    while (takenNames.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  };

  // For NEW roles the slug is generated from the display name (it's immutable
  // once the role exists, so editing leaves it untouched).
  const onDisplayName = (value: string) =>
    setForm((f) => ({ ...f, displayName: value, name: editing?.id ? f.name : uniqueSlug(value) }));

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
    if (!form.displayName.trim()) return toast({ variant: 'error', title: 'Display name required' });
    if (!form.name.trim()) return toast({ variant: 'error', title: 'Add letters or numbers to the display name', description: 'The role slug is generated from it and came out empty.' });
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
    <div className="space-y-6">
      <Link href="/admin/team" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Team
      </Link>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Roles &amp; permissions</h1>
          <p className="mt-1 text-body text-muted-foreground">Built-in system roles (read-only) plus custom roles you compose from the permission catalog.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />New custom role</Button>
      </header>

      {/* System roles — read-only. Access is enforced by role, so these are not editable. */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-graphite" />
          <h2 className="font-display text-heading-sm text-charcoal-primary">System roles</h2>
          <Badge variant="muted">built-in</Badge>
        </div>
        <p className="text-caption text-muted-foreground">
          The platform&rsquo;s standard roles and what each is designed to do. These are enforced by the system and can&rsquo;t be edited — create a custom role below if you need a different mix.
        </p>
        <Card><CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="divide-y divide-stone-surface">
              {systemRoles.map((r) => {
                const isOpen = expanded.has(r.role);
                const grouped: Record<string, string[]> = {};
                for (const p of r.permissions as string[]) {
                  const { module, label } = humanizePerm(p);
                  (grouped[module] ??= []).push(label);
                }
                return (
                  <div key={r.role} className="p-4">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(r.role)}
                      className="flex w-full items-start justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-charcoal-primary">{r.displayName}</span>
                          <Badge variant="muted">{r.role}</Badge>
                          {r.fullAccess && <Badge variant="info">full access</Badge>}
                          <span className="inline-flex items-center gap-1 text-caption text-muted-foreground"><Lock className="h-3 w-3" />read-only</span>
                        </div>
                        {r.description && <p className="mt-0.5 text-caption text-muted-foreground">{r.description}</p>}
                        <p className="mt-1 text-caption text-muted-foreground">
                          {r.fullAccess ? 'All permissions' : `${r.permissionCount} permission(s)`}
                        </p>
                      </div>
                      {isOpen ? <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <div className="mt-3 space-y-2">
                        {r.fullAccess ? (
                          <p className="text-caption text-graphite">This role has unrestricted access to every feature in the organization.</p>
                        ) : r.permissionCount === 0 ? (
                          <p className="text-caption text-muted-foreground">Scoped access governed by built-in role rules — no granular permission profile.</p>
                        ) : (
                          Object.entries(grouped).map(([mod, labels]) => (
                            <div key={mod} className="rounded-lg bg-stone-surface/50 p-3">
                              <p className="mb-1.5 text-caption font-semibold uppercase tracking-wider text-muted-foreground">{mod}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {labels.map((l) => <Badge key={l} variant="secondary">{l}</Badge>)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent></Card>
      </section>

      <div className="flex items-center gap-2 pt-2">
        <Plus className="h-4 w-4 text-graphite" />
        <h2 className="font-display text-heading-sm text-charcoal-primary">Custom roles</h2>
      </div>

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
                  <Label>Display name <span className="text-coral-red">*</span></Label>
                  <Input value={form.displayName} onChange={(e) => onDisplayName(e.target.value)} required placeholder="Block A managing agent" />
                </div>
                <div className="space-y-1.5">
                  <Label>Name (slug)</Label>
                  <Input
                    value={form.name}
                    readOnly
                    disabled={!!editing?.id}
                    placeholder="auto-generated"
                    className="font-mono text-[13px] text-muted-foreground"
                  />
                  <p className="text-caption text-muted-foreground">
                    {editing?.id ? 'Fixed — the slug can’t change after a role is created.' : 'Generated from the display name; always unique.'}
                  </p>
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
