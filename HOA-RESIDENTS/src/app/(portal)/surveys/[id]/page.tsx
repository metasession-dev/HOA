'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function ResidentSurveyDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [s, setS] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<any>(`/surveys/${id}`).then((r) => setS(r.data)).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const setAnswer = (qId: string, value: any) => setAnswers({ ...answers, [qId]: value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s) return;
    const payload = (s.questions as any[]).map((q) => ({ questionId: q.id, value: answers[q.id] }));
    setSubmitting(true);
    try {
      const idemp = `survey-${id}-${Date.now()}`;
      await api.post(`/surveys/${id}/responses`, { answers: payload }, idemp);
      toast({ variant: 'success', title: 'Response submitted', description: 'Thanks for your feedback.' });
      router.push('/surveys');
    } catch (err: any) {
      toast({ variant: 'error', title: 'Submit failed', description: err.message });
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!s) return <Card><CardContent className="p-10 text-center"><p className="text-body text-muted-foreground">Not found.</p></CardContent></Card>;

  const questions = (s.questions as any[]) || [];
  const canSubmit = s.status === 'open' && !s.hasSubmitted;

  return (
    <div className="space-y-6">
      <Link href="/surveys" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Surveys
      </Link>
      <header>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={s.status === 'open' ? 'success' : 'muted'}>{s.status}</Badge>
          {s.anonymous && <Badge variant="muted">anonymous</Badge>}
        </div>
        <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">{s.title}</h1>
        <p className="text-body text-muted-foreground mt-1">{s.description}</p>
      </header>

      {s.hasSubmitted && (
        <Card><CardContent className="p-5 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-meadow-green" />
          <p className="text-sm text-graphite">You've already submitted this survey. Thank you.</p>
        </CardContent></Card>
      )}

      {canSubmit && (
        <form onSubmit={handleSubmit}>
          <Card><CardContent className="space-y-5 p-6">
            {questions.map((q, i) => (
              <div key={q.id} className="space-y-2">
                <Label>
                  <span className="text-caption text-muted-foreground mr-2">Q{i + 1}</span>
                  {q.label}
                  {q.required && <span className="text-coral-red ml-1">*</span>}
                </Label>
                {q.type === 'mc' && (
                  <div className="space-y-1.5">
                    {(q.options || []).map((o: any) => {
                      const sel = answers[q.id] === o.id || (Array.isArray(answers[q.id]) && answers[q.id].includes(o.id));
                      return (
                        <button key={o.id} type="button" onClick={() => setAnswer(q.id, o.id)}
                          className={cn(
                            'w-full rounded-lg px-4 py-2.5 text-left text-sm transition-colors',
                            sel ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone',
                          )}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {q.type === 'rating' && (
                  <div className="flex gap-1">
                    {Array.from({ length: q.ratingMax || 5 }, (_, j) => j + 1).map((n) => (
                      <button key={n} type="button" onClick={() => setAnswer(q.id, n)}
                        className={cn(
                          'h-10 w-10 rounded-lg text-sm font-medium transition-colors',
                          answers[q.id] === n ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone',
                        )}>
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'text' && (
                  <textarea rows={3}
                    className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
                    value={answers[q.id] || ''} onChange={(e) => setAnswer(q.id, e.target.value)} required={q.required} />
                )}
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit response'}</Button>
            </div>
          </CardContent></Card>
        </form>
      )}
    </div>
  );
}
