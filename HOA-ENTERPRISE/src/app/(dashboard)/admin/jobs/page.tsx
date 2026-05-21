'use client';

import { useEffect, useState } from 'react';
import { Workflow, Play, RotateCw, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

type Queue = {
  name: string;
  description?: string;
  disabled?: boolean;
  error?: string;
  counts?: {
    waiting: number; active: number; completed: number; failed: number; delayed: number; paused: number;
  };
  repeatableJobs?: { id: string; name: string; pattern?: string; next: string | null }[];
};

export default function AdminJobsPage() {
  const confirm = useConfirm();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failedDrill, setFailedDrill] = useState<{ queue: string; rows: any[] } | null>(null);

  const load = () => {
    setLoading(true);
    api.get<any>('/jobs').then((r) => setQueues(r.data || []))
      .catch((err) => toast({ variant: 'error', title: 'Failed', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const runNow = async (name: string) => {
    const ok = await confirm({
      title: `Run "${name}" now?`,
      description: 'Triggers a one-shot job outside the cron schedule.',
      confirmText: 'Run',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post<any>(`/jobs/${name}/run`, {});
      toast({ variant: 'success', title: 'Queued', description: `Job ${r.data.jobId}` });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const viewFailed = async (name: string) => {
    try {
      const r = await api.get<any>(`/jobs/${name}/failed?take=20`);
      setFailedDrill({ queue: name, rows: r.data || [] });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const retryJob = async (queue: string, jobId: string) => {
    try {
      await api.post(`/jobs/${queue}/failed/${jobId}/retry`, {});
      toast({ variant: 'success', title: 'Retried' });
      viewFailed(queue);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Background jobs</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Bull + Redis. Each queue runs on its own cron. Failed jobs are kept in a dead-letter list and can be retried from here.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : queues.length === 0 ? (
        <Card><CardContent className="p-10 text-center">
          <Workflow className="mx-auto h-8 w-8 text-graphite" />
          <p className="mt-3 text-body text-charcoal-primary font-medium">No queues</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {queues.map((q) => (
            <Card key={q.name}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-medium text-charcoal-primary">{q.name}</h3>
                      {q.disabled && <Badge variant="muted">disabled</Badge>}
                      {q.error && <Badge variant="destructive">error</Badge>}
                    </div>
                    {q.description && <p className="text-caption text-muted-foreground mt-0.5">{q.description}</p>}
                  </div>
                </div>

                {q.counts && (
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(q.counts).map(([k, v]) => (
                      <div key={k} className={cn(
                        'rounded-lg px-2 py-1.5 text-center shadow-inset-stone',
                        k === 'failed' && v > 0 ? 'bg-coral-red/10' : k === 'active' && v > 0 ? 'bg-meadow-green/10' : '',
                      )}>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
                        <p className="text-base font-medium text-charcoal-primary tabular-nums">{v}</p>
                      </div>
                    ))}
                  </div>
                )}

                {(q.repeatableJobs || []).length > 0 && (
                  <div>
                    <p className="text-caption text-muted-foreground">Schedule</p>
                    {q.repeatableJobs!.map((r) => (
                      <p key={r.id} className="text-caption text-graphite">
                        <code className="bg-stone-surface px-1 py-0.5 rounded text-[11px] font-mono">{r.pattern || `every ${r.id}`}</code>
                        {r.next && <span className="ml-2 text-muted-foreground">next {formatDate(r.next)}</span>}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex gap-1.5 pt-1">
                  <Button size="sm" variant="secondary" disabled={busy || q.disabled} onClick={() => runNow(q.name)}>
                    <Play className="mr-1 h-3.5 w-3.5" />Run now
                  </Button>
                  {(q.counts?.failed ?? 0) > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => viewFailed(q.name)}>
                      <AlertTriangle className="mr-1 h-3.5 w-3.5" />View {q.counts!.failed} failed
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Drawer open={!!failedDrill} onOpenChange={(o) => !o && setFailedDrill(null)}>
        <DrawerContent size="lg">
          <DrawerHeader>
            <DrawerTitle>Failed jobs · {failedDrill?.queue}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="space-y-3">
            {!failedDrill || failedDrill.rows.length === 0 ? (
              <p className="text-caption text-muted-foreground">No failed jobs.</p>
            ) : (
              <ul className="divide-y divide-stone-surface">
                {failedDrill.rows.map((j) => (
                  <li key={j.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-caption text-graphite">{j.id} · {j.attemptsMade} attempts</span>
                      <Button size="sm" variant="secondary" onClick={() => retryJob(failedDrill.queue, j.id)}>
                        <RotateCw className="mr-1 h-3.5 w-3.5" />Retry
                      </Button>
                    </div>
                    <p className="text-caption text-coral-red mt-1">{j.failedReason}</p>
                    {j.data && Object.keys(j.data).length > 0 && (
                      <pre className="text-[11px] bg-stone-surface/50 rounded p-2 mt-1 overflow-x-auto">{JSON.stringify(j.data, null, 2)}</pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setFailedDrill(null)}>Close</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
