'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { getOrgCurrency, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

export default function ViolationCategoriesPage() {
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', description: '', defaultFine: '', graceDays: 7 });
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get<any>('/violations/categories').then((r) => setCats(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const beginEdit = (c: any) => {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description || '',
      defaultFine: c.defaultFine ? String(c.defaultFine) : '',
      graceDays: c.graceDays || 7,
    });
    setShowCreate(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: any = {
        name: form.name,
        description: form.description || undefined,
        defaultFine: form.defaultFine ? parseFloat(form.defaultFine) : undefined,
        // Fines always use the org's settings currency — no per-category override.
        fineCurrency: getOrgCurrency(),
        graceDays: Number(form.graceDays),
      };
      if (editing) {
        await api.put(`/violations/categories/${editing.id}`, payload);
        toast({ variant: 'success', title: 'Category updated' });
      } else {
        await api.post('/violations/categories', payload);
        toast({ variant: 'success', title: 'Category created' });
      }
      setShowCreate(false);
      setEditing(null);
      setForm({ name: '', description: '', defaultFine: '', graceDays: 7 });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <Link href="/violations" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />
        Violations
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Violation categories</h1>
          <p className="mt-1 text-body text-muted-foreground">Define your CC&amp;R breach categories and default fines.</p>
        </div>
        {!showCreate && (
          <Button onClick={() => { setEditing(null); setForm({ name: '', description: '', defaultFine: '', graceDays: 7 }); setShowCreate(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />New category
          </Button>
        )}
      </header>

      {showCreate && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">{editing ? 'Edit category' : 'New category'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Input id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="defaultFine">Default fine ({getOrgCurrency()})</Label>
                  <Input id="defaultFine" type="number" step="0.01" min="0" value={form.defaultFine} onChange={(e) => setForm({ ...form, defaultFine: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="graceDays">Grace days</Label>
                  <Input id="graceDays" type="number" min="0" value={form.graceDays} onChange={(e) => setForm({ ...form, graceDays: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); setEditing(null); }}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : cats.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              <p>No categories yet. Create one to start logging violations.</p>
            </div>
          ) : (
            <ul className="divide-y divide-stone-surface">
              {cats.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-charcoal-primary">{c.name}</p>
                    {c.description && <p className="text-caption text-muted-foreground">{c.description}</p>}
                    <div className="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">
                      {c.defaultFine && <Badge variant="muted">Default fine: {formatCurrency(Number(c.defaultFine))}</Badge>}
                      <Badge variant="muted">{c.graceDays}d grace</Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => beginEdit(c)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
