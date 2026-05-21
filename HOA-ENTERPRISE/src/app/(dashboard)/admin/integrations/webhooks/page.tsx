'use client';

import { useEffect, useState } from 'react';
import { Webhook, Plus, Copy, Trash2, CheckCircle2, RefreshCw, Send, Power } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

type Endpoint = {
  id: string; name: string; url: string; events: string[];
  description?: string; isActive: boolean; consecutiveFailures: number;
  disableAfterFailures: number; lastDeliveryAt: string | null; createdAt: string;
};

type Delivery = {
  id: string; event: string; status: 'pending' | 'success' | 'failed' | 'dead';
  attempt: number; maxAttempts: number; responseStatus: number | null;
  errorMessage: string | null; deliveredAt: string | null; createdAt: string;
  endpointId: string;
};

export default function WebhooksPage() {
  const confirm = useConfirm();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [allEvents, setAllEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [newSecret, setNewSecret] = useState<{ url: string; secret: string } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<any>('/platform/webhooks').then((r) => setEndpoints(r.data || [])),
      api.get<any>('/platform/webhooks/deliveries').then((r) => setDeliveries(r.data || [])),
      api.get<any>('/platform/webhooks/events').then((r) => setAllEvents(r.data?.events || [])),
    ]).catch((err) => toast({ variant: 'error', title: 'Failed', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggleEvent = (ev: string) => {
    setEvents((curr) => curr.includes(ev) ? curr.filter((x) => x !== ev) : [...curr, ev]);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url || events.length === 0) {
      toast({ variant: 'error', title: 'Name, URL, and at least one event are required' });
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<any>('/platform/webhooks', { name, url, events, description: description || undefined });
      setNewSecret({ url: r.data.url, secret: r.data.secret });
      setShowCreate(false); setName(''); setUrl(''); setEvents([]); setDescription('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const rotate = async (ep: Endpoint) => {
    const ok = await confirm({
      title: `Rotate secret for "${ep.name}"?`,
      description: 'The current secret stops working. You must update the receiver before deliveries resume validating.',
      confirmText: 'Rotate',
      destructive: true,
    });
    if (!ok) return;
    try {
      const r = await api.post<any>(`/platform/webhooks/${ep.id}/rotate`, {});
      setNewSecret({ url: ep.url, secret: r.data.secret });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const test = async (ep: Endpoint) => {
    try {
      const r = await api.post<any>(`/platform/webhooks/${ep.id}/test`, {});
      const d = r.data;
      const ok = d.status === 'success';
      toast({
        variant: ok ? 'success' : 'error',
        title: ok ? `Test delivered (HTTP ${d.responseStatus})` : `Test failed`,
        description: d.errorMessage || `Response: ${d.responseStatus}`,
      });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const toggleActive = async (ep: Endpoint) => {
    try {
      await api.put(`/platform/webhooks/${ep.id}`, { isActive: !ep.isActive });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const del = async (ep: Endpoint) => {
    const ok = await confirm({
      title: `Delete "${ep.name}"?`,
      description: 'All delivery history for this endpoint will also be removed.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/platform/webhooks/${ep.id}`);
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast({ variant: 'success', title: 'Copied' }));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Webhook endpoints</h1>
          <p className="mt-1 text-body text-muted-foreground">
            HOA.africa POSTs signed JSON to your URL when events happen. Verify the <code className="px-1.5 py-0.5 rounded bg-stone-surface text-[11px] font-mono">X-HOA-Signature</code> header (HMAC-SHA256).
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="mr-1.5 h-4 w-4" />New endpoint</Button>
      </header>

      {newSecret && (
        <Card className="border-deep-amber/40 bg-deep-amber/5">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-meadow-green" />
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Webhook secret</h3>
            </div>
            <p className="text-caption text-graphite">This is the only time the secret will be shown. Save it now.</p>
            <div className="text-caption text-muted-foreground">For: <span className="font-mono">{newSecret.url}</span></div>
            <div className="flex items-center gap-2 rounded-lg bg-charcoal-primary px-3 py-2.5 font-mono text-xs text-white overflow-x-auto">
              <span className="truncate flex-1">{newSecret.secret}</span>
              <button onClick={() => copy(newSecret.secret)} className="shrink-0 rounded p-1 hover:bg-white/10" title="Copy">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setNewSecret(null)}>Got it</Button>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">Endpoints</h2>
        <Card><CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : endpoints.length === 0 ? (
            <div className="p-10 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface text-graphite">
                <Webhook className="h-5 w-5" />
              </div>
              <p className="mt-3 text-body text-charcoal-primary font-medium">No endpoints yet</p>
              <p className="text-caption text-muted-foreground">Add one to start receiving events.</p>
            </div>
          ) : (
            <ul className="divide-y divide-stone-surface">
              {endpoints.map((ep) => (
                <li key={ep.id} className="p-4 flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-charcoal-primary">{ep.name}</span>
                      {ep.isActive
                        ? <Badge variant="success">active</Badge>
                        : <Badge variant="muted">inactive</Badge>}
                      {ep.consecutiveFailures > 0 && (
                        <Badge variant="warning">{ep.consecutiveFailures} consecutive failures</Badge>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[12px] text-graphite break-all">{ep.url}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {ep.events.map((e) => <Badge key={e} variant="muted">{e}</Badge>)}
                    </div>
                    {ep.description && <p className="text-caption text-muted-foreground mt-1.5">{ep.description}</p>}
                    {ep.lastDeliveryAt && (
                      <p className="text-caption text-muted-foreground mt-1">Last delivery {formatDate(ep.lastDeliveryAt)}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => test(ep)}><Send className="mr-1 h-3.5 w-3.5" />Test</Button>
                    <Button size="sm" variant="ghost" onClick={() => rotate(ep)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Rotate</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(ep)}><Power className="mr-1 h-3.5 w-3.5" />{ep.isActive ? 'Disable' : 'Enable'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => del(ep)}><Trash2 className="mr-1 h-3.5 w-3.5" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">Recent deliveries</h2>
        <Card><CardContent className="p-0">
          {deliveries.length === 0 ? (
            <div className="p-8 text-center text-caption text-muted-foreground">No deliveries yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-stone-surface/60 text-caption text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Event</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">HTTP</th>
                  <th className="px-4 py-2 text-left font-medium">Attempts</th>
                  <th className="px-4 py-2 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-surface">
                {deliveries.slice(0, 50).map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2 font-mono text-graphite text-[12px]">{d.event}</td>
                    <td className="px-4 py-2">
                      <Badge variant={d.status === 'success' ? 'success' : d.status === 'dead' ? 'destructive' : d.status === 'pending' ? 'warning' : 'muted'}>{d.status}</Badge>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-charcoal-primary">{d.responseStatus ?? '—'}</td>
                    <td className="px-4 py-2 text-caption text-muted-foreground">{d.attempt}/{d.maxAttempts}</td>
                    <td className="px-4 py-2 text-caption text-muted-foreground">{formatDate(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent></Card>
      </section>

      <Drawer open={showCreate} onOpenChange={setShowCreate}>
        <DrawerContent size="md">
          <form onSubmit={create} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>New webhook endpoint</DrawerTitle>
              <DrawerDescription>
                HOA.africa POSTs signed JSON when events happen. Verify the signature with the secret you receive.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wname">Name</Label>
                <Input id="wname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Boom gate vendor" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wurl">URL (https)</Label>
                <Input id="wurl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/hoa" required />
              </div>
              <div className="space-y-1.5">
                <Label>Subscribe to events</Label>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-lg p-2 shadow-inset-stone">
                  {allEvents.map((ev) => (
                    <button key={ev} type="button" onClick={() => toggleEvent(ev)}
                      className={`rounded-pill px-2.5 py-1 text-[11px] font-mono border transition-colors ${
                        events.includes(ev)
                          ? 'border-ember-orange bg-ember-orange/10 text-ember-orange'
                          : 'border-stone-surface bg-card text-graphite hover:bg-stone-surface'
                      }`}>
                      {ev}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wdesc">Description (optional)</Label>
                <Input id="wdesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Owner / purpose" />
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={busy}>Create</Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
