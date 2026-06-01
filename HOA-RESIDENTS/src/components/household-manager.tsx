'use client';

/**
 * Household & occupants manager for the resident profile page.
 *
 * Lets a resident add/update/remove the family members and other occupants
 * living in a unit they occupy (AdditionalOccupant — lightweight, no login).
 * Photos + relationship/age/contact/notes. Everything is scoped server-side to
 * units the caller actually occupies (`/me/household`), so there's no way to
 * reach another unit's household here.
 */
import { useEffect, useState } from 'react';
import { UserPlus, Pencil, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn, getInitials } from '@/lib/utils';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';

const RELATIONSHIPS = ['spouse', 'partner', 'child', 'parent', 'sibling', 'relative', 'domestic_staff', 'other'];
const GENDERS = ['male', 'female', 'other', 'undisclosed'];
const AGE_GROUPS = ['infant', 'child', 'teenager', 'adult', 'senior'];

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

type MyUnit = { unit: { id: string; unitNumber: string; block: string | null; estate: { name: string } } };

type Member = {
  id: string;
  unitId: string;
  firstName: string;
  lastName?: string | null;
  relationship?: string | null;
  gender?: string | null;
  ageGroup?: string | null;
  email?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  unit?: { unitNumber: string; block: string | null };
};

const emptyForm = {
  unitId: '',
  firstName: '',
  lastName: '',
  relationship: '',
  gender: '',
  ageGroup: '',
  email: '',
  phone: '',
  notes: '',
};

function title(s?: string | null) {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function HouseholdManager() {
  const confirm = useConfirm();
  const [members, setMembers] = useState<Member[]>([]);
  const [units, setUnits] = useState<MyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [photo, setPhoto] = useState<UploadedFile[]>([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<any>('/me/household').then((r) => setMembers(r.data || [])),
      api.get<any>('/me/units').then((r) => setUnits(r.data || [])),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const startAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, unitId: units[0]?.unit.id ?? '' });
    setPhoto([]);
    setOpen(true);
  };

  const startEdit = (m: Member) => {
    setEditingId(m.id);
    setForm({
      unitId: m.unitId,
      firstName: m.firstName ?? '',
      lastName: m.lastName ?? '',
      relationship: m.relationship ?? '',
      gender: m.gender ?? '',
      ageGroup: m.ageGroup ?? '',
      email: m.email ?? '',
      phone: m.phone ?? '',
      notes: m.notes ?? '',
    });
    setPhoto(m.photoUrl ? [{ url: m.photoUrl, filename: 'photo', contentType: 'image/png' }] : []);
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim()) {
      toast({ variant: 'error', title: 'First name is required' });
      return;
    }
    if (!editingId && !form.unitId) {
      toast({ variant: 'error', title: 'Pick a unit' });
      return;
    }
    setSaving(true);
    const payload: any = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim() || undefined,
      relationship: form.relationship || undefined,
      gender: form.gender || undefined,
      ageGroup: form.ageGroup || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      notes: form.notes.trim() || undefined,
      photoUrl: photo[0]?.url ?? null,
    };
    try {
      if (editingId) {
        await api.put(`/me/household/${editingId}`, payload);
      } else {
        await api.post('/me/household', { ...payload, unitId: form.unitId });
      }
      toast({ variant: 'success', title: editingId ? 'Member updated' : 'Member added' });
      setOpen(false);
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: Member) => {
    const ok = await confirm({
      title: `Remove ${m.firstName}?`,
      description: 'They will no longer be listed as an occupant of your unit.',
      confirmText: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/me/household/${m.id}`);
      toast({ variant: 'success', title: 'Removed' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not remove', description: err?.message });
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-heading-sm font-medium text-charcoal-primary">Household &amp; occupants</h2>
            <p className="mt-1 text-caption text-muted-foreground">
              Family members and others living in your unit. Visible to your HOA for access and safety.
            </p>
          </div>
          {units.length > 0 && (
            <Button size="sm" variant="secondary" onClick={startAdd}>
              <UserPlus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          )}
        </div>

        {loading ? (
          <Skeleton className="h-24" />
        ) : units.length === 0 ? (
          <p className="rounded-lg bg-warning/10 px-3 py-2.5 text-caption text-deep-amber">
            You&rsquo;re not linked to a unit yet, so there&rsquo;s nowhere to add household members.
          </p>
        ) : (
          <>
            {members.length === 0 ? (
              <div className="rounded-lg bg-stone-surface/40 p-6 text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-surface">
                  <Users className="h-5 w-5 text-graphite" />
                </div>
                <p className="mt-2 text-caption text-muted-foreground">No household members added yet.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-lg bg-stone-surface/40 p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-surface text-caption font-medium text-graphite">
                      {m.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveUrl(m.photoUrl)} alt={m.firstName} className="h-full w-full object-cover" />
                      ) : (
                        getInitials(m.firstName, m.lastName ?? '')
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-charcoal-primary truncate">
                        {m.firstName} {m.lastName ?? ''}
                      </p>
                      <p className="text-caption text-muted-foreground truncate">
                        {[title(m.relationship), title(m.ageGroup)].filter(Boolean).join(' · ')}
                        {m.unit?.unitNumber ? ` · Unit ${m.unit.unitNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => startEdit(m)} className="rounded-full p-1.5 text-muted-foreground hover:bg-stone-surface hover:text-charcoal-primary" aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(m)} className="rounded-full p-1.5 text-muted-foreground hover:bg-stone-surface hover:text-coral-red" aria-label="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

          </>
        )}
      </CardContent>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent size="md">
          <form onSubmit={save} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>{editingId ? 'Edit household member' : 'Add household member'}</DrawerTitle>
              <DrawerDescription>Occupants are visible to your HOA for access and safety.</DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              {!editingId && units.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Unit</Label>
                  <select className={selectClass} value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
                    {units.map((u) => (
                      <option key={u.unit.id} value={u.unit.id}>
                        Unit {u.unit.unitNumber}{u.unit.block ? ` · Block ${u.unit.block}` : ''} · {u.unit.estate.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>First name</Label>
                  <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Last name</Label>
                  <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Relationship</Label>
                  <select className={selectClass} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
                    <option value="">—</option>
                    {RELATIONSHIPS.map((r) => <option key={r} value={r}>{title(r)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Age group</Label>
                  <select className={selectClass} value={form.ageGroup} onChange={(e) => setForm({ ...form, ageGroup: e.target.value })}>
                    <option value="">—</option>
                    {AGE_GROUPS.map((a) => <option key={a} value={a}>{title(a)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <select className={selectClass} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                    <option value="">—</option>
                    {GENDERS.map((g) => <option key={g} value={g}>{title(g)}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Email (optional)</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone (optional)</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <textarea
                  className="flex min-h-[70px] w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  maxLength={1000}
                />
              </div>

              <FileUpload
                value={photo}
                onChange={setPhoto}
                maxFiles={1}
                kind="user_avatar"
                accept={['image/jpeg', 'image/png', 'image/webp']}
                label="Photo (optional)"
                helpText="PNG, JPG or WebP."
              />
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" loading={saving}>{editingId ? 'Save changes' : 'Add member'}</Button>
              <DrawerClose asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </Card>
  );
}

function resolveUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}${url}`;
}
