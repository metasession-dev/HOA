'use client';

import { useEffect, useState } from 'react';
import { Wallet, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

const TYPES = ['operating', 'reserve', 'sinking', 'special_levy'] as const;
const typeBadge: Record<string, 'success' | 'info' | 'accent' | 'muted'> = {
  operating: 'info',
  reserve: 'success',
  sinking: 'accent',
  special_levy: 'muted',
};

export default function FundsPage() {
  const [funds, setFunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'operating', description: '', openingBalance: '' });
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<any>('/finance/funds').then((r) => setFunds(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast({ variant: 'error', title: 'Name required' });
    setBusy(true);
    try {
      await api.post('/finance/funds', {
        name: form.name.trim(),
        type: form.type,
        description: form.description || undefined,
        openingBalance: form.openingBalance ? Number(form.openingBalance) : 0,
      });
      toast({ variant: 'success', title: 'Fund created' });
      setShowNew(false);
      setForm({ name: '', type: 'operating', description: '', openingBalance: '' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Create failed', description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Funds</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Segregate money by purpose: operating, reserve, sinking, special levy. Journal entries tag a fund to keep balances clean.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus className="mr-1.5 h-4 w-4" />Add fund</Button>
      </header>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : funds.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
              <Wallet className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No funds yet</p>
            <p className="text-caption text-muted-foreground">Start with an Operating fund and a Reserve fund.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3 text-right">Opening balance</th>
                  <th className="px-6 py-3 text-right">Current balance</th>
                </tr>
              </thead>
              <tbody>
                {funds.map((f, idx) => (
                  <tr key={f.id} className={idx !== funds.length - 1 ? 'border-b border-stone-surface' : ''}>
                    <td className="px-6 py-3 text-graphite font-medium">{f.name}</td>
                    <td className="px-6 py-3"><Badge variant={typeBadge[f.type] || 'muted'}>{f.type.replace('_', ' ')}</Badge></td>
                    <td className="px-6 py-3 text-right text-graphite tabular-nums">{Number(f.openingBalance).toFixed(2)}</td>
                    <td className="px-6 py-3 text-right text-charcoal-primary font-medium tabular-nums">{Number(f.currentBalance).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>

      <Drawer open={showNew} onOpenChange={setShowNew}>
        <DrawerContent size="md">
          <form onSubmit={create} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>New fund</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name <span className="text-coral-red">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Operating fund" />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                  {TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Opening balance</Label>
                <Input type="number" step={0.01} value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create fund'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
