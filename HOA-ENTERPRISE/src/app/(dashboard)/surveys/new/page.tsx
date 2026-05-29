'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

type Question = {
  id: string;
  type: 'mc' | 'rating' | 'text';
  label: string;
  options?: { id: string; label: string }[];
  required?: boolean;
  ratingMax?: number;
};

let qCounter = 1;
function newQ(type: Question['type']): Question {
  const id = `q${qCounter++}`;
  if (type === 'mc') return { id, type, label: '', options: [{ id: 'a', label: '' }, { id: 'b', label: '' }], required: true };
  if (type === 'rating') return { id, type, label: '', ratingMax: 5, required: true };
  return { id, type, label: '', required: false };
}

export default function NewSurveyPage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: '', description: '', anonymous: true, opensAt: '', closesAt: '' });
  const [questions, setQuestions] = useState<Question[]>([newQ('mc')]);
  const [submitting, setSubmitting] = useState(false);

  const updateQuestion = (idx: number, patch: Partial<Question>) => {
    const next = [...questions];
    next[idx] = { ...next[idx], ...patch };
    setQuestions(next);
  };
  const removeQuestion = (idx: number) => setQuestions(questions.filter((_, i) => i !== idx));
  const addOpt = (qIdx: number) => {
    const next = [...questions];
    const q = next[qIdx];
    q.options = [...(q.options || []), { id: String.fromCharCode(97 + (q.options?.length || 0)), label: '' }];
    setQuestions(next);
  };
  const updateOpt = (qIdx: number, oIdx: number, key: 'id' | 'label', value: string) => {
    const next = [...questions];
    const q = next[qIdx];
    if (!q.options) return;
    q.options = q.options.map((o, i) => (i === oIdx ? { ...o, [key]: value } : o));
    setQuestions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        title: form.title,
        description: form.description,
        anonymous: form.anonymous,
        questions,
        opensAt: form.opensAt ? new Date(form.opensAt).toISOString() : undefined,
        closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : undefined,
      };
      const res: any = await api.post('/surveys', payload);
      toast({ variant: 'success', title: 'Survey saved' });
      router.push(`/surveys/${res.data.id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <Link href="/surveys" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Surveys
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">New survey</h1>
        <p className="mt-1 text-body text-muted-foreground">Add questions and open when ready.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card><CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea id="description" rows={3} required
              className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={4000} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="opensAt">Opens (optional)</Label>
              <Input id="opensAt" type="datetime-local" value={form.opensAt} onChange={(e) => setForm({ ...form, opensAt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closesAt">Closes (optional)</Label>
              <Input id="closesAt" type="datetime-local" value={form.closesAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-graphite">
            <input type="checkbox" checked={form.anonymous} onChange={(e) => setForm({ ...form, anonymous: e.target.checked })} />
            Anonymous responses (recommended)
          </label>
        </CardContent></Card>

        <Card><CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Questions</h3>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setQuestions([...questions, newQ('mc')])}><Plus className="mr-1 h-3 w-3" />MC</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setQuestions([...questions, newQ('rating')])}><Plus className="mr-1 h-3 w-3" />Rating</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setQuestions([...questions, newQ('text')])}><Plus className="mr-1 h-3 w-3" />Text</Button>
            </div>
          </div>

          <div className="space-y-4">
            {questions.map((q, qi) => (
              <div key={q.id} className="rounded-lg bg-card shadow-inset-stone p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label>Question {qi + 1} <span className="font-mono text-caption text-muted-foreground">({q.type})</span></Label>
                    <Input placeholder="Question label" value={q.label} onChange={(e) => updateQuestion(qi, { label: e.target.value })} required />
                  </div>
                  {questions.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeQuestion(qi)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                  )}
                </div>
                {q.type === 'mc' && q.options && (
                  <div className="space-y-1.5">
                    <Label>Options</Label>
                    {q.options.map((o, oi) => (
                      <div key={oi} className="flex gap-2">
                        <Input placeholder="id" value={o.id} onChange={(e) => updateOpt(qi, oi, 'id', e.target.value)} className="w-24" />
                        <Input placeholder="label" value={o.label} onChange={(e) => updateOpt(qi, oi, 'label', e.target.value)} className="flex-1" />
                      </div>
                    ))}
                    <Button type="button" variant="ghost" size="sm" onClick={() => addOpt(qi)}>+ Add option</Button>
                  </div>
                )}
                {q.type === 'rating' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Max rating</Label>
                      <select className={selectClass} value={q.ratingMax || 5} onChange={(e) => updateQuestion(qi, { ratingMax: Number(e.target.value) })}>
                        <option value={3}>3</option><option value={5}>5</option><option value={10}>10</option>
                      </select>
                    </div>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-graphite">
                  <input type="checkbox" checked={q.required ?? false} onChange={(e) => updateQuestion(qi, { required: e.target.checked })} />
                  Required
                </label>
              </div>
            ))}
          </div>
        </CardContent></Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save survey'}</Button>
        </div>
      </form>
    </div>
  );
}
