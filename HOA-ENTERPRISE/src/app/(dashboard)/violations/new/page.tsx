'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

export default function NewViolationPage() {
  const router = useRouter();
  const [estates, setEstates] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [estateId, setEstateId] = useState('');
  const [form, setForm] = useState({
    unitId: '',
    categoryId: '',
    occurredAt: new Date().toISOString().slice(0, 16),
    description: '',
  });
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // An enterprise has a single estate — default to it; no estate picker.
    api.get<any>('/estates').then((r) => {
      const list = r.data || [];
      setEstates(list);
      if (list[0]?.id) setEstateId(list[0].id);
    });
    api.get<any>('/violations/categories').then((r) => setCategories(r.data || []));
  }, []);

  useEffect(() => {
    if (estateId) {
      api.get<any>(`/estates/${estateId}/units`).then((r) => setUnits(r.data || []));
    } else {
      setUnits([]);
    }
  }, [estateId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const idempKey = `viol-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res: any = await api.post('/violations', { ...form, occurredAt: new Date(form.occurredAt).toISOString(), photos }, idempKey);
      toast({ variant: 'success', title: 'Violation logged' });
      router.push(`/violations/${res.data.id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not log violation', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (categories.length === 0) {
    return (
      <div className="space-y-4">
        <Link href="/violations" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
          <ChevronLeft className="h-3 w-3" />
          Violations
        </Link>
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-body text-charcoal-primary font-medium">No categories yet</p>
            <p className="text-caption text-muted-foreground">Create a violation category before logging your first violation.</p>
            <Link href="/violations/categories" className="mt-4 inline-block">
              <Button>Manage categories</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/violations" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />
        Violations
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Log violation</h1>
        <p className="mt-1 text-body text-muted-foreground">Capture the breach. Notice + fine + appeal flow follows.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label htmlFor="unit">Unit</Label>
              <select id="unit" className={selectClass} value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} required disabled={!estateId}>
                <option value="">{units.length ? 'Select unit…' : 'Loading units…'}</option>
                {units.map((u: any) => <option key={u.id} value={u.id}>Unit {u.unitNumber}{u.block ? ` · Block ${u.block}` : ''}</option>)}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <select id="category" className={selectClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                  <option value="">Select category…</option>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.defaultFine ? ` (default fine ${c.fineCurrency} ${c.defaultFine})` : ''}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="occurredAt">When occurred</Label>
                <Input id="occurredAt" type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={5}
                className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="What happened? Where? Who was involved?"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required
                maxLength={4000}
              />
            </div>
            <FileUpload
              value={photos}
              onChange={setPhotos}
              maxFiles={10}
              kind="violation_photo"
              accept={['image/jpeg', 'image/png', 'image/webp', 'application/pdf']}
              label="Photo evidence (up to 10)"
              helpText="Drop photos or PDFs of the violation. Max 10 files."
            />
          </CardContent>
        </Card>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Logging…' : 'Log violation'}</Button>
        </div>
      </form>
    </div>
  );
}
