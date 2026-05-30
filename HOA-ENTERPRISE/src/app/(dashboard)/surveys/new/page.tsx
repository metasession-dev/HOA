'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2, Sparkles, LayoutTemplate, Wand2, GripVertical } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

const typeBadge: Record<string, string> = { mc: 'Multiple choice', rating: 'Rating', text: 'Open text' };

export default function NewSurveyPage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: '', description: '', anonymous: true, opensAt: '', closesAt: '' });
  const [questions, setQuestions] = useState<Question[]>([newQ('mc')]);
  const [submitting, setSubmitting] = useState(false);

  // Kickstart: templates + AI
  const [templates, setTemplates] = useState<any[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    api.get<any>('/surveys/templates').then((r) => setTemplates(r.data || [])).catch(() => {});
  }, []);

  const applyDraft = (d: any) => {
    setForm((f) => ({
      ...f,
      title: d.title || '',
      description: d.description || '',
      anonymous: d.anonymous ?? true,
    }));
    const qs: Question[] = (d.questions || []).map((q: any, i: number) => ({
      id: `q${i + 1}`,
      type: ['mc', 'rating', 'text'].includes(q.type) ? q.type : 'text',
      label: q.label || '',
      options: q.type === 'mc'
        ? (q.options || []).map((o: any, j: number) => ({ id: o.id || String.fromCharCode(97 + j), label: o.label ?? '' }))
        : undefined,
      required: !!q.required,
      ratingMax: q.type === 'rating' ? (q.ratingMax || 5) : undefined,
    }));
    qCounter = qs.length + 1;
    setQuestions(qs.length ? qs : [newQ('mc')]);
  };

  const useTemplate = (t: any) => {
    applyDraft(t.survey);
    toast({ variant: 'success', title: `Loaded "${t.name}"`, description: 'Tweak it, then save.' });
  };

  const generateAI = async () => {
    if (!aiPrompt.trim()) {
      toast({ variant: 'error', title: 'Describe your survey first' });
      return;
    }
    setAiBusy(true);
    try {
      const r = await api.post<any>('/surveys/generate', { prompt: aiPrompt.trim() });
      applyDraft(r.data);
      toast({
        variant: 'success',
        title: 'Draft generated',
        description: r.data?.generatedBy && r.data.generatedBy !== 'offline'
          ? 'Review and edit before saving.'
          : 'Generated an offline starter — review and edit.',
      });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not generate', description: err.message });
    } finally {
      setAiBusy(false);
    }
  };

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
  const removeOpt = (qIdx: number, oIdx: number) => {
    const next = [...questions];
    const q = next[qIdx];
    if (!q.options) return;
    q.options = q.options.filter((_, i) => i !== oIdx);
    setQuestions(next);
  };
  const updateOptLabel = (qIdx: number, oIdx: number, label: string) => {
    const next = [...questions];
    const q = next[qIdx];
    if (!q.options) return;
    q.options = q.options.map((o, i) => (i === oIdx ? { ...o, label } : o));
    setQuestions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Ensure option ids are unique + present before submit (labels are what
      // the admin edits; ids are derived).
      const cleaned = questions.map((q) => ({
        ...q,
        options: q.type === 'mc'
          ? (q.options || []).filter((o) => o.label.trim()).map((o, j) => ({ id: String.fromCharCode(97 + j), label: o.label.trim() }))
          : undefined,
      }));
      const payload: any = {
        title: form.title,
        description: form.description,
        anonymous: form.anonymous,
        questions: cleaned,
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
        <p className="mt-1 text-body text-muted-foreground">Start from a template, generate one with AI, or build from scratch.</p>
      </header>

      {/* Kickstart — AI + templates */}
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-icon bg-ember-orange/10 text-ember-orange"><Sparkles className="h-4 w-4" /></span>
              <div>
                <h3 className="text-heading-sm font-medium text-charcoal-primary">Generate with AI</h3>
                <p className="text-caption text-muted-foreground">Describe what you want to learn — we’ll draft the questions.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Measure satisfaction with security and parking, and gather ideas for the clubhouse"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generateAI(); } }}
              />
              <Button type="button" onClick={generateAI} loading={aiBusy} className="shrink-0">
                <Wand2 className="mr-1.5 h-4 w-4" />{aiBusy ? 'Generating…' : 'Generate'}
              </Button>
            </div>
          </div>

          {templates.length > 0 && (
            <div className="space-y-2 border-t border-stone-surface pt-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-icon bg-stone-surface text-graphite"><LayoutTemplate className="h-4 w-4" /></span>
                <div>
                  <h3 className="text-heading-sm font-medium text-charcoal-primary">Start from a template</h3>
                  <p className="text-caption text-muted-foreground">Proven starting points you can adapt.</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => useTemplate(t)}
                    className="rounded-lg border border-stone-surface p-3 text-left transition-colors hover:border-ember-orange/40 hover:bg-stone-surface/40"
                  >
                    <p className="text-sm font-medium text-charcoal-primary">{t.name}</p>
                    <p className="mt-0.5 text-caption text-muted-foreground line-clamp-2">{t.description}</p>
                    <p className="mt-1 text-caption text-ember-orange">{t.survey?.questions?.length ?? 0} questions</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
              <Input id="closesAt" type="datetime-local" value={form.closesAt} min={form.opensAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-graphite">
            <input type="checkbox" checked={form.anonymous} onChange={(e) => setForm({ ...form, anonymous: e.target.checked })} className="accent-ember-orange" />
            Anonymous responses (recommended)
          </label>
        </CardContent></Card>

        <Card><CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Questions <span className="text-caption text-muted-foreground">({questions.length})</span></h3>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setQuestions([...questions, newQ('mc')])}><Plus className="mr-1 h-3 w-3" />Multiple choice</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setQuestions([...questions, newQ('rating')])}><Plus className="mr-1 h-3 w-3" />Rating</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setQuestions([...questions, newQ('text')])}><Plus className="mr-1 h-3 w-3" />Open text</Button>
            </div>
          </div>

          <div className="space-y-4">
            {questions.map((q, qi) => (
              <div key={q.id} className="rounded-lg bg-card shadow-inset-stone p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label>Question {qi + 1}</Label>
                      <Badge variant="muted">{typeBadge[q.type]}</Badge>
                    </div>
                    <Input placeholder="Ask your question…" value={q.label} onChange={(e) => updateQuestion(qi, { label: e.target.value })} required />
                  </div>
                  {questions.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeQuestion(qi)} aria-label="Remove question">
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-coral-red" />
                    </Button>
                  )}
                </div>
                {q.type === 'mc' && q.options && (
                  <div className="space-y-1.5">
                    <Label className="text-caption text-muted-foreground">Options</Label>
                    {q.options.map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                        <Input placeholder={`Option ${oi + 1}`} value={o.label} onChange={(e) => updateOptLabel(qi, oi, e.target.value)} className="flex-1" />
                        {q.options!.length > 2 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeOpt(qi, oi)} aria-label="Remove option">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-coral-red" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="ghost" size="sm" onClick={() => addOpt(qi)}><Plus className="mr-1 h-3 w-3" />Add option</Button>
                  </div>
                )}
                {q.type === 'rating' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Scale (1 to…)</Label>
                      <select className={selectClass} value={q.ratingMax || 5} onChange={(e) => updateQuestion(qi, { ratingMax: Number(e.target.value) })}>
                        <option value={3}>3</option><option value={5}>5</option><option value={10}>10</option>
                      </select>
                    </div>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-graphite">
                  <input type="checkbox" checked={q.required ?? false} onChange={(e) => updateQuestion(qi, { required: e.target.checked })} className="accent-ember-orange" />
                  Required
                </label>
              </div>
            ))}
          </div>
        </CardContent></Card>

        <div className="flex justify-end gap-2 border-t border-stone-surface pt-4">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" loading={submitting}>{submitting ? 'Saving…' : 'Save survey'}</Button>
        </div>
      </form>
    </div>
  );
}
