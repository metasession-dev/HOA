'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Plus, Copy, Trash2, CheckCircle2 } from 'lucide-react';
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

type ApiKey = {
  id: string; name: string; prefix: string; permissions: string[];
  isActive: boolean; rateLimitPerMin: number | null;
  lastUsedAt: string | null; lastUsedIp: string | null;
  expiresAt: string | null; createdAt: string;
  revokedAt: string | null; revokedReason: string | null;
};

const COMMON_PERMS = [
  '*', 'invoices.read', 'invoices.create', 'payments.read', 'payments.create',
  'passes.read', 'passes.create', 'violations.read', 'people.read',
];

export default function ApiKeysPage() {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<string[]>(['*']);
  const [rateLimit, setRateLimit] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [newKey, setNewKey] = useState<{ plainKey: string; prefix: string } | null>(null);

  const load = () => {
    setLoading(true);
    api.get<any>('/platform/api-keys')
      .then((r) => setKeys(r.data || []))
      .catch((err) => toast({ variant: 'error', title: 'Failed', description: err.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const togglePerm = (p: string) => {
    setPerms((curr) => curr.includes(p) ? curr.filter((x) => x !== p) : [...curr, p]);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || perms.length === 0) {
      toast({ variant: 'error', title: 'Name and at least one permission required' });
      return;
    }
    setBusy(true);
    try {
      const payload: any = { name, permissions: perms };
      if (rateLimit) payload.rateLimitPerMin = Number(rateLimit);
      if (expiresAt) payload.expiresAt = expiresAt;
      const r = await api.post<any>('/platform/api-keys', payload);
      setNewKey({ plainKey: r.data.plainKey, prefix: r.data.prefix });
      setShowCreate(false);
      setName(''); setPerms(['*']); setRateLimit(''); setExpiresAt('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const revoke = async (k: ApiKey) => {
    const ok = await confirm({
      title: `Revoke "${k.name}"?`,
      description: `Integrations using key ${k.prefix}… will stop working immediately. This is not reversible.`,
      confirmText: 'Revoke',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/platform/api-keys/${k.id}`);
      toast({ variant: 'success', title: 'Revoked' });
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
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">API keys</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Long-lived credentials for integrators (accountants, hardware vendors). Use the <code className="px-1.5 py-0.5 rounded bg-stone-surface text-[11px] font-mono">X-API-Key</code> header.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="mr-1.5 h-4 w-4" />New key</Button>
      </header>

      {newKey && (
        <Card className="border-deep-amber/40 bg-deep-amber/5">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-meadow-green" />
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Key created</h3>
            </div>
            <p className="text-caption text-graphite">
              This is the only time this key will be shown. Store it somewhere safe (your vault, password manager).
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-charcoal-primary px-3 py-2.5 font-mono text-xs text-white overflow-x-auto">
              <span className="truncate flex-1">{newKey.plainKey}</span>
              <button onClick={() => copy(newKey.plainKey)} className="shrink-0 rounded p-1 hover:bg-white/10" title="Copy">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setNewKey(null)}>Got it</Button>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : keys.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface text-graphite">
              <KeyRound className="h-5 w-5" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No API keys yet</p>
            <p className="text-caption text-muted-foreground">Create one to let an integrator pull HOA data.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-stone-surface/60 text-caption text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Prefix</th>
                <th className="px-4 py-2 text-left font-medium">Permissions</th>
                <th className="px-4 py-2 text-left font-medium">Last used</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-surface">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-2.5 text-charcoal-primary">{k.name}</td>
                  <td className="px-4 py-2.5 font-mono text-graphite">{k.prefix}…</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {k.permissions.slice(0, 3).map((p) => <Badge key={p} variant="muted">{p}</Badge>)}
                      {k.permissions.length > 3 && <Badge variant="muted">+{k.permissions.length - 3}</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-caption">{k.lastUsedAt ? formatDate(k.lastUsedAt) : 'never'}</td>
                  <td className="px-4 py-2.5">
                    {k.revokedAt
                      ? <Badge variant="destructive">revoked</Badge>
                      : k.isActive ? <Badge variant="success">active</Badge> : <Badge variant="muted">inactive</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!k.revokedAt && (
                      <Button size="sm" variant="ghost" onClick={() => revoke(k)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent></Card>

      <Drawer open={showCreate} onOpenChange={setShowCreate}>
        <DrawerContent size="md">
          <form onSubmit={create} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>New API key</DrawerTitle>
              <DrawerDescription>
                Generates a long-lived <code className="px-1 rounded bg-stone-surface text-[11px] font-mono">hoa_live_…</code> credential. You&rsquo;ll see the plaintext once.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="kname">Name</Label>
                <Input id="kname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Accountant integration" required />
              </div>
              <div className="space-y-1.5">
                <Label>Permissions</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_PERMS.map((p) => (
                    <button key={p} type="button" onClick={() => togglePerm(p)}
                      className={`rounded-pill px-2.5 py-1 text-[11px] font-mono border transition-colors ${
                        perms.includes(p)
                          ? 'border-ember-orange bg-ember-orange/10 text-ember-orange'
                          : 'border-stone-surface bg-card text-graphite hover:bg-stone-surface'
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use <code className="font-mono">*</code> for full access, or pick a subset for narrow integrations.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rl">Rate limit (req/min)</Label>
                  <Input id="rl" type="number" min="1" max="10000" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} placeholder="60 (default)" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exp">Expires (optional)</Label>
                  <Input id="exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </div>
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
