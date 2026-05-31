'use client';

/**
 * Shared create/edit form for contract tenders. Used by both /contracts/new and
 * /contracts/[id]/edit. In edit mode it loads the existing tender and PUTs;
 * otherwise it POSTs a new one.
 *
 * Notes:
 *  - Currency is NOT a field — tenders always use the org's settings currency.
 *  - Category is a dropdown of curated categories plus a "Custom…" escape hatch.
 *  - "Generate with AI" buttons draft the Summary and Scope of work via the
 *    assistant (POST /tenders/ai/draft); the manager edits before saving.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Sparkles, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import { TENDER_CATEGORIES } from '@/lib/tender-categories';

const textareaClass = cn(
  'flex w-full rounded-lg bg-card px-3 py-2 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);
const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);
const CUSTOM = '__custom__';

export function TenderForm({ tenderId }: { tenderId?: string }) {
  const router = useRouter();
  const editing = !!tenderId;
  const [form, setForm] = useState({
    title: '',
    description: '',
    scopeOfWork: '',
    category: '',
    budgetMin: '',
    budgetMax: '',
    closesAt: '',
  });
  // Category dropdown: either a known category, or CUSTOM (then categoryCustom holds the text).
  const [categorySelect, setCategorySelect] = useState('');
  const [categoryCustom, setCategoryCustom] = useState('');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<'summary' | 'scope' | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!tenderId) return;
    api
      .get<any>(`/tenders/${tenderId}`)
      .then((r) => {
        const t = r.data;
        setForm({
          title: t.title ?? '',
          description: t.description ?? '',
          scopeOfWork: t.scopeOfWork ?? '',
          category: t.category ?? '',
          budgetMin: t.budgetMin != null ? String(t.budgetMin) : '',
          budgetMax: t.budgetMax != null ? String(t.budgetMax) : '',
          closesAt: t.closesAt ? new Date(t.closesAt).toISOString().slice(0, 10) : '',
        });
        if (t.category) {
          if ((TENDER_CATEGORIES as readonly string[]).includes(t.category)) {
            setCategorySelect(t.category);
          } else {
            setCategorySelect(CUSTOM);
            setCategoryCustom(t.category);
          }
        }
        setAttachments(
          (t.attachments || []).map((a: any) => ({ url: a.url, filename: a.filename, contentType: a.contentType, size: a.size })),
        );
      })
      .catch((err) => toast({ variant: 'error', title: 'Could not load tender', description: err.message }))
      .finally(() => setLoading(false));
  }, [tenderId]);

  const resolvedCategory = categorySelect === CUSTOM ? categoryCustom.trim() : categorySelect;

  const generate = async (field: 'summary' | 'scope') => {
    if (!form.title.trim()) {
      toast({ variant: 'error', title: 'Add a title first', description: 'The assistant uses the title for context.' });
      return;
    }
    setAiBusy(field);
    try {
      const r = await api.post<any>('/tenders/ai/draft', {
        title: form.title.trim(),
        category: resolvedCategory || undefined,
        field,
        context: field === 'scope' ? form.description.trim() || undefined : undefined,
      });
      const text = r.data?.text?.trim();
      if (text) {
        set(field === 'summary' ? 'description' : 'scopeOfWork', text);
        toast({ variant: 'success', title: 'Draft inserted', description: 'Review and edit before saving.' });
      }
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not generate', description: err.message });
    } finally {
      setAiBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      toast({ variant: 'error', title: 'Title and summary required' });
      return;
    }
    if (!form.closesAt) {
      toast({ variant: 'error', title: 'Closing date required', description: 'Choose when bidding closes.' });
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      scopeOfWork: form.scopeOfWork.trim() || undefined,
      category: resolvedCategory || undefined,
      budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
      budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
      closesAt: form.closesAt,
      attachments: attachments.map((a) => ({ url: a.url, filename: a.filename, contentType: a.contentType, size: a.size ?? 0 })),
    };
    try {
      if (editing) {
        await api.put<any>(`/tenders/${tenderId}`, payload);
        toast({ variant: 'success', title: 'Tender updated' });
        router.push(`/contracts/${tenderId}`);
      } else {
        const res = await api.post<any>('/tenders', payload);
        toast({ variant: 'success', title: 'Tender created', description: 'Open it to start collecting bids.' });
        router.push(`/contracts/${res.data.id}`);
      }
    } catch (err: any) {
      toast({ variant: 'error', title: editing ? 'Could not update tender' : 'Could not create tender', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-caption text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <Link href={editing ? `/contracts/${tenderId}` : '/contracts'} className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Contracts
      </Link>

      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">{editing ? 'Edit tender' : 'New tender'}</h1>
        <p className="mt-1 text-body text-muted-foreground">Define the contract opportunity. You can open it for bids after saving.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card><CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Estate landscaping, 12-month contract" required />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Summary</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => generate('summary')} disabled={aiBusy !== null}>
                {aiBusy === 'summary' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                Generate with AI
              </Button>
            </div>
            <textarea id="description" className={textareaClass} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What the contract is for" required />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="scope">Scope of work (optional)</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => generate('scope')} disabled={aiBusy !== null}>
                {aiBusy === 'scope' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                Generate with AI
              </Button>
            </div>
            <textarea id="scope" className={textareaClass} rows={6} value={form.scopeOfWork} onChange={(e) => set('scopeOfWork', e.target.value)} placeholder="Detailed requirements, deliverables, terms…" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                className={selectClass}
                value={categorySelect}
                onChange={(e) => setCategorySelect(e.target.value)}
              >
                <option value="">Select a category…</option>
                {TENDER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value={CUSTOM}>Custom…</option>
              </select>
              {categorySelect === CUSTOM && (
                <Input className="mt-2" value={categoryCustom} onChange={(e) => setCategoryCustom(e.target.value)} placeholder="Enter a custom category" maxLength={120} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closesAt">Bidding closes</Label>
              <Input id="closesAt" type="date" value={form.closesAt} onChange={(e) => set('closesAt', e.target.value)} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="budgetMin">Budget min (optional)</Label>
              <Input id="budgetMin" type="number" step="0.01" min="0" value={form.budgetMin} onChange={(e) => set('budgetMin', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budgetMax">Budget max (optional)</Label>
              <Input id="budgetMax" type="number" step="0.01" min="0" value={form.budgetMax} onChange={(e) => set('budgetMax', e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <p className="text-caption text-muted-foreground">Budgets use your organisation&rsquo;s settings currency.</p>
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
          <Button type="submit" loading={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create tender'}</Button>
        </div>
      </form>
    </div>
  );
}
