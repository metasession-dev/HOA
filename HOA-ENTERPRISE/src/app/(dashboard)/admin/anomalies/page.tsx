'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X, RefreshCw, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

const severityBadge: Record<string, 'destructive' | 'warning' | 'info' | 'muted'> = {
  critical: 'destructive', warning: 'warning', info: 'info',
};

const statuses = ['open', 'acknowledged', 'dismissed', 'all'] as const;

export default function AnomaliesPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<typeof statuses[number]>('open');
  const [busy, setBusy] = useState(false);
  const [showDismiss, setShowDismiss] = useState<any | null>(null);
  const [dismissReason, setDismissReason] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    setLoading(true);
    api.get<any>(`/anomalies?${params.toString()}`).then((r) => setItems(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  const runDetectors = async () => {
    setBusy(true);
    try {
      const idemp = `detect-${Date.now()}`;
      const r = await api.post<any>('/anomalies/detect', {}, idemp);
      toast({ variant: 'success', title: 'Detectors ran', description: `${r.data.created} new · ${r.data.skippedDuplicates} duplicate(s) skipped` });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const acknowledge = async (a: any) => {
    const ok = await confirm({
      title: 'Acknowledge this anomaly?',
      description: 'You confirm you have seen it and accept responsibility for follow-up.',
      confirmText: 'Acknowledge',
    });
    if (!ok) return;
    try {
      await api.post(`/anomalies/${a.id}/acknowledge`, {});
      toast({ variant: 'success', title: 'Acknowledged' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const dismiss = async () => {
    if (!showDismiss) return;
    try {
      await api.post(`/anomalies/${showDismiss.id}/dismiss`, { reason: dismissReason || undefined });
      toast({ variant: 'success', title: 'Dismissed' });
      setShowDismiss(null); setDismissReason('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const openCount = items.filter((a) => !a.acknowledgedAt && !a.dismissedAt).length;
  const criticalCount = items.filter((a) => a.severity === 'critical' && !a.dismissedAt).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Anomaly detection</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Heuristic detectors flag arrears spikes, vendor-invoice deviations, duplicate payments, and cash-flow shortfalls.
          </p>
        </div>
        <Button onClick={runDetectors} disabled={busy}><RefreshCw className={cn('mr-1.5 h-4 w-4', busy && 'animate-spin')} />Run detectors</Button>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Open" value={openCount} tone="warning" icon={AlertTriangle} />
        <StatCard label="Critical" value={criticalCount} tone="destructive" icon={AlertTriangle} />
        <StatCard label="In view" value={items.length} tone="default" icon={Filter} />
      </div>

      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {statuses.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={cn('rounded-pill px-3 py-1 text-caption font-medium transition-colors capitalize',
              status === s ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone')}>
            {s}
          </button>
        ))}
      </div>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-meadow-green/15 text-meadow-green">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No {status} anomalies</p>
            <p className="text-caption text-muted-foreground">Run the detectors when you want a fresh sweep.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-surface">
            {items.map((a) => (
              <div key={a.id} className="p-5 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={severityBadge[a.severity] || 'muted'}>{a.severity}</Badge>
                    <Badge variant="muted">{a.type.replace(/_/g, ' ')}</Badge>
                    {a.acknowledgedAt && <Badge variant="info">acknowledged</Badge>}
                    {a.dismissedAt && <Badge variant="muted">dismissed</Badge>}
                  </div>
                  <p className="text-sm text-graphite mt-1.5">{a.description}</p>
                  <p className="text-caption text-muted-foreground mt-1">
                    Detected {formatDate(a.detectedAt)}
                    {a.acknowledgedAt && ` · ack ${formatDate(a.acknowledgedAt)}`}
                    {a.dismissedAt && ` · dismissed ${formatDate(a.dismissedAt)}${a.dismissedReason ? ` — ${a.dismissedReason}` : ''}`}
                  </p>
                  {a.metrics && Object.keys(a.metrics).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-caption text-muted-foreground cursor-pointer">Show metrics</summary>
                      <pre className="text-[11px] bg-stone-surface/50 rounded px-2 py-1.5 mt-1 overflow-x-auto">{JSON.stringify(a.metrics, null, 2)}</pre>
                    </details>
                  )}
                </div>
                {!a.acknowledgedAt && !a.dismissedAt && (
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => acknowledge(a)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Ack</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowDismiss(a)}><X className="mr-1 h-3.5 w-3.5" />Dismiss</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>

      <Drawer open={!!showDismiss} onOpenChange={(o) => !o && setShowDismiss(null)}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>Dismiss anomaly</DrawerTitle>
            {showDismiss && <DrawerDescription>{showDismiss.description}</DrawerDescription>}
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} placeholder="False positive · Already addressed · …" />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="destructive" onClick={dismiss}>Dismiss</Button>
            <Button variant="secondary" onClick={() => setShowDismiss(null)}>Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function StatCard({ label, value, tone, icon: Icon }: { label: string; value: number; tone: 'default' | 'warning' | 'destructive'; icon: any }) {
  const toneClass = tone === 'destructive' ? 'text-coral-red bg-coral-red/10' : tone === 'warning' ? 'text-deep-amber bg-deep-amber/10' : 'text-graphite bg-stone-surface';
  return (
    <Card><CardContent className="flex items-center gap-3 p-4">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', toneClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="text-heading-sm font-display font-medium text-charcoal-primary tabular-nums">{value}</p>
      </div>
    </CardContent></Card>
  );
}
