'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, PlayCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';

const statusBadge: Record<string, 'muted' | 'success' | 'info'> = { draft: 'muted', open: 'success', closed: 'info' };

export default function AdminSurveyDetail() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [s, setS] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.all([
      api.get<any>(`/surveys/${id}`).then((r) => setS(r.data)),
      api.get<any>(`/surveys/${id}/results`).then((r) => setResults(r.data)).catch(() => setResults(null)),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const transition = async (action: 'open' | 'close') => {
    const ok = await confirm({ title: `${action[0].toUpperCase() + action.slice(1)} this survey?`, confirmText: `Yes, ${action}` });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/surveys/${id}/${action}`);
      toast({ variant: 'success', title: 'Done' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!s) return <Card><CardContent className="p-10 text-center"><p className="text-body text-muted-foreground">Survey not found.</p></CardContent></Card>;

  const questions = (s.questions as any[]) || [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/surveys" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Surveys
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge variant={statusBadge[s.status] || 'muted'}>{s.status}</Badge>
          <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">{s.title}</h1>
          <p className="text-caption text-muted-foreground">{questions.length} questions{s.anonymous ? ' · anonymous' : ''}</p>
        </div>
        <div className="flex gap-2">
          {s.status === 'draft' && <Button onClick={() => transition('open')} disabled={busy}><PlayCircle className="mr-1.5 h-4 w-4" />Open</Button>}
          {s.status === 'open' && <Button variant="secondary" onClick={() => transition('close')} disabled={busy}><CheckCircle2 className="mr-1.5 h-4 w-4" />Close</Button>}
        </div>
      </header>

      <Card><CardContent className="p-6 space-y-2">
        <p className="text-body text-graphite whitespace-pre-wrap">{s.description}</p>
      </CardContent></Card>

      {results && (
        <Card><CardContent className="p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3">Results ({results.responseCount} responses)</h3>
          {results.responseCount === 0 ? (
            <p className="text-caption text-muted-foreground">No responses yet.</p>
          ) : (
            <div className="space-y-4">
              {questions.map((q: any) => {
                const t = results.totals[q.id];
                if (!t) return null;
                if (t.type === 'mc') {
                  const max = Math.max(1, ...t.options.map((o: any) => o.count));
                  return (
                    <div key={q.id}>
                      <p className="text-sm font-medium text-charcoal-primary mb-2">{q.label}</p>
                      <div className="space-y-2">
                        {t.options.map((o: any) => (
                          <div key={o.id}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-graphite">{o.label}</span>
                              <span className="text-muted-foreground">{o.count}</span>
                            </div>
                            <div className="h-2 rounded-full bg-stone-surface overflow-hidden">
                              <div className="h-full bg-ember-orange" style={{ width: `${(o.count / max) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                if (t.type === 'rating') {
                  return (
                    <div key={q.id}>
                      <p className="text-sm font-medium text-charcoal-primary">{q.label}</p>
                      <p className="text-caption text-muted-foreground">Average {t.average} over {t.count} responses</p>
                    </div>
                  );
                }
                return (
                  <div key={q.id}>
                    <p className="text-sm font-medium text-charcoal-primary">{q.label}</p>
                    <p className="text-caption text-muted-foreground mb-2">{t.count} text responses</p>
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {t.samples.slice(0, 10).map((s: string, i: number) => (
                        <li key={i} className="text-caption text-graphite p-2 card-warm rounded">{s}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent></Card>
      )}

      <Card><CardContent className="p-6">
        <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3">Questions</h3>
        <ul className="space-y-2">
          {questions.map((q: any, i: number) => (
            <li key={q.id} className="flex items-start gap-2 text-sm">
              <span className="font-mono text-caption text-muted-foreground w-8 shrink-0">Q{i + 1}</span>
              <div>
                <p className="text-graphite">{q.label}</p>
                <p className="text-caption text-muted-foreground">{q.type}{q.required ? ' · required' : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent></Card>
    </div>
  );
}
