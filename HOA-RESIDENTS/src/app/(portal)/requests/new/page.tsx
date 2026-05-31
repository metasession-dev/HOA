'use client';

/**
 * Resident-side "new request" form. Two key behaviours:
 *
 *  1. Unit is AUTO-FILLED from `/me/units`. The resident already belongs to
 *     a unit — making them pick "their estate, then their unit" from giant
 *     lists is bad UX. If they occupy multiple units (rare but real — e.g.
 *     someone who owns one and rents another), we show a small picker.
 *  2. Categories load from the API. The backend auto-seeds a sensible
 *     default list on the first request for an org with none, so the
 *     dropdown is never empty.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Home } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';

const ATTACH_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm', 'video/quicktime'];

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

type MyUnit = {
  occupancyId: string;
  role: string;
  isPrimaryContact: boolean;
  startDate: string;
  unit: {
    id: string;
    unitNumber: string;
    block: string | null;
    floor: number | null;
    type: string;
    estate: { id: string; name: string; address: string | null };
  };
};

export default function NewRequestPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [myUnits, setMyUnits] = useState<MyUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [form, setForm] = useState({ categoryId: '', subject: '', body: '', unitId: '' });
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<any>('/requests/categories')
      .then((r) => setCategories(r.data || []))
      .catch(console.error);
    api
      .get<any>('/me/units')
      .then((r) => {
        const items: MyUnit[] = r.data || [];
        setMyUnits(items);
        // Auto-select the only unit (or the primary one if multiple).
        if (items.length > 0) {
          const primary = items.find((m) => m.isPrimaryContact) ?? items[0];
          setForm((f) => ({ ...f, unitId: primary.unit.id }));
        }
      })
      .catch(console.error)
      .finally(() => setLoadingUnits(false));
  }, []);

  // Default the category to the first option once they arrive so the form
  // is never submitted with categoryId=''.
  useEffect(() => {
    if (categories.length > 0 && !form.categoryId) {
      setForm((f) => ({ ...f, categoryId: categories[0].id }));
    }
  }, [categories]);

  const activeUnit = myUnits.find((m) => m.unit.id === form.unitId)?.unit ?? null;
  const activeRole = myUnits.find((m) => m.unit.id === form.unitId)?.role ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryId || !form.subject || !form.body || !form.unitId) {
      toast({ variant: 'error', title: 'Fill in all required fields' });
      return;
    }
    setSubmitting(true);
    try {
      const idemp = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        ...form,
        attachments: attachments.map((a) => ({ url: a.url, filename: a.filename, contentType: a.contentType, size: a.size ?? 0 })),
      };
      const r = await api.post<any>('/requests', payload, idemp);
      toast({ variant: 'success', title: 'Request submitted' });
      router.replace(`/requests/${r.data.id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <Link href="/requests" className="inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-charcoal-primary">
        <ChevronLeft className="h-3.5 w-3.5" /> Back to my requests
      </Link>

      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">New request</h1>
        <p className="mt-1 text-body text-muted-foreground">We&rsquo;ll route this to the right person on your HOA team.</p>
      </header>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Unit context — auto-filled. Read-only chip when there's only
                one unit, a compact picker when there are multiple. Either
                way the resident never sees an estate-selector. */}
            <div className="space-y-1.5">
              <Label>For unit</Label>
              {loadingUnits ? (
                <p className="text-caption text-muted-foreground">Looking up your unit…</p>
              ) : myUnits.length === 0 ? (
                <p className="rounded-lg bg-warning/10 px-3 py-2.5 text-caption text-deep-amber">
                  You're not linked to a unit yet. Ask your HOA admin to add you in /admin/people first.
                </p>
              ) : myUnits.length === 1 && activeUnit ? (
                <div className="flex items-center gap-2 rounded-lg bg-stone-surface/60 px-3 py-2.5">
                  <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm font-medium text-charcoal-primary">
                    Unit {activeUnit.unitNumber}
                    {activeUnit.block && <span className="text-muted-foreground"> · Block {activeUnit.block}</span>}
                    {' · '}
                    <span className="text-muted-foreground">{activeUnit.estate.name}</span>
                  </p>
                  {activeRole && (
                    <Badge variant={activeRole === 'owner' ? 'success' : 'info'} className="ml-auto">
                      {activeRole}
                    </Badge>
                  )}
                </div>
              ) : (
                <select
                  className={selectClass}
                  value={form.unitId}
                  onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                >
                  {myUnits.map((m) => (
                    <option key={m.unit.id} value={m.unit.id}>
                      Unit {m.unit.unitNumber}
                      {m.unit.block ? ` · Block ${m.unit.block}` : ''}
                      {' · '}
                      {m.unit.estate.name}
                      {' '}({m.role})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat">Category</Label>
              <select
                id="cat"
                className={selectClass}
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                required
              >
                {categories.length === 0 && <option value="">Loading…</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.slaResolveHours ? ` · response in ${c.slaResolveHours}h` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Short summary" maxLength={200} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body">Details</Label>
              <textarea
                id="body"
                className="flex min-h-[140px] w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone placeholder:text-muted-foreground focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="What's going on?"
                maxLength={8000}
                required
              />
            </div>

            <FileUpload
              value={attachments}
              onChange={setAttachments}
              kind="request_attachment"
              label="Attachments (optional)"
              helpText="Add a photo, PDF, or short video clip (max 50MB each)."
              accept={ATTACH_ACCEPT}
            />

            <div className="flex justify-end">
              <Button type="submit" loading={submitting} disabled={!form.unitId}>
                {submitting ? 'Submitting…' : 'Submit request'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
