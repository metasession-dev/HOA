'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { getOrgCurrency, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';

const textareaClass = cn(
  'flex w-full rounded-lg bg-card px-3 py-2 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

export default function NewTenderPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    description: '',
    scopeOfWork: '',
    category: '',
    budgetMin: '',
    budgetMax: '',
    currency: getOrgCurrency(),
    closesAt: '',
  });
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      toast({ variant: 'error', title: 'Title and description required' });
      return;
    }
    if (!form.closesAt) {
      toast({ variant: 'error', title: 'Closing date required', description: 'Choose when bidding closes.' });
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<any>('/tenders', {
        title: form.title.trim(),
        description: form.description.trim(),
        scopeOfWork: form.scopeOfWork.trim() || undefined,
        category: form.category.trim() || undefined,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        currency: form.currency.trim().toUpperCase() || undefined,
        closesAt: form.closesAt,
        attachments: attachments.map((a) => ({ url: a.url, filename: a.filename, contentType: a.contentType, size: a.size ?? 0 })),
      });
      toast({ variant: 'success', title: 'Tender created', description: 'Open it to start collecting bids.' });
      router.push(`/contracts/${res.data.id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not create tender', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/contracts" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Contracts
      </Link>

      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">New tender</h1>
        <p className="mt-1 text-body text-muted-foreground">Define the contract opportunity. You can open it for bids after saving.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card><CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Estate landscaping — 12-month contract" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Summary</Label>
            <textarea id="description" className={textareaClass} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What the contract is for" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scope">Scope of work (optional)</Label>
            <textarea id="scope" className={textareaClass} rows={5} value={form.scopeOfWork} onChange={(e) => set('scopeOfWork', e.target.value)} placeholder="Detailed requirements, deliverables, terms…" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category (optional)</Label>
              <Input id="category" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Landscaping" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closesAt">Bidding closes</Label>
              <Input id="closesAt" type="date" value={form.closesAt} onChange={(e) => set('closesAt', e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="budgetMin">Budget min (optional)</Label>
              <Input id="budgetMin" type="number" step="0.01" min="0" value={form.budgetMin} onChange={(e) => set('budgetMin', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budgetMax">Budget max (optional)</Label>
              <Input id="budgetMax" type="number" step="0.01" min="0" value={form.budgetMax} onChange={(e) => set('budgetMax', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" value={form.currency} onChange={(e) => set('currency', e.target.value)} maxLength={8} />
            </div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-6">
          <FileUpload
            value={attachments}
            onChange={setAttachments}
            kind="document"
            label="Tender documents (optional)"
            helpText="Attach the scope document, drawings, or terms (PDF or image)."
            accept={['application/pdf', 'image/jpeg', 'image/png', 'image/webp']}
          />
        </CardContent></Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" loading={saving}>{saving ? 'Creating…' : 'Create tender'}</Button>
        </div>
      </form>
    </div>
  );
}
