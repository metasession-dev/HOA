'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Landmark, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

export default function BankingHomePage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [gl, setGl] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', bankName: '', accountNumber: '', glAccountId: '', openingBalance: '' });
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<any>('/banking/accounts').then((r) => setAccounts(r.data || [])),
      api.get<any>('/finance/gl-accounts').then((r) => setGl((r.data || []).filter((g: any) => g.type === 'asset'))),
    ]).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.glAccountId) return toast({ variant: 'error', title: 'Name + GL account required' });
    setBusy(true);
    try {
      await api.post('/banking/accounts', {
        name: form.name.trim(),
        bankName: form.bankName || undefined,
        accountNumber: form.accountNumber || undefined,
        glAccountId: form.glAccountId,
        openingBalance: form.openingBalance ? Number(form.openingBalance) : 0,
      });
      toast({ variant: 'success', title: 'Bank account created' });
      setShowNew(false);
      setForm({ name: '', bankName: '', accountNumber: '', glAccountId: '', openingBalance: '' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Create failed', description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Banking & reconciliation</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Track bank balances, import statements, auto-categorize and reconcile against your GL.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/finance/banking/rules"><Button variant="secondary">Categorization rules</Button></Link>
          <Button onClick={() => setShowNew(true)}><Plus className="mr-1.5 h-4 w-4" />Add bank account</Button>
        </div>
      </header>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : accounts.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
              <Landmark className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No bank accounts yet</p>
            <p className="text-caption text-muted-foreground">Add an account linked to a bank GL to start importing transactions.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-surface">
            {accounts.map((a) => (
              <Link key={a.id} href={`/finance/banking/${a.id}`}
                className="flex items-center justify-between p-5 hover:bg-stone-surface/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-charcoal-primary truncate">{a.name}</p>
                  <p className="text-caption text-muted-foreground">
                    {a.bankName ? `${a.bankName} · ` : ''}{a.accountNumber ? `••••${a.accountNumber} · ` : ''}{a.glAccount.code} {a.glAccount.name}
                  </p>
                  <p className="text-caption text-muted-foreground">{a.lastSyncAt ? `Last sync ${new Date(a.lastSyncAt).toLocaleString()}` : 'Never synced'}</p>
                </div>
                <div className="flex items-center gap-3">
                  {!a.isActive && <Badge variant="muted">inactive</Badge>}
                  <div className="text-right">
                    <p className="text-caption text-muted-foreground">Current balance</p>
                    <p className={cn('text-heading-sm font-display tabular-nums', a.currentBalance < 0 ? 'text-coral-red' : 'text-charcoal-primary')}>
                      {a.currency} {Number(a.currentBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent></Card>

      <Drawer open={showNew} onOpenChange={setShowNew}>
        <DrawerContent size="md">
          <form onSubmit={create} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>New bank account</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name <span className="text-coral-red">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Operating - FNB Cheque" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label>Bank</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="FNB" /></div>
                <div className="space-y-1.5"><Label>Account # (last 4)</Label><Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} maxLength={4} placeholder="6789" /></div>
              </div>
              <div className="space-y-1.5">
                <Label>GL account <span className="text-coral-red">*</span></Label>
                <select required value={form.glAccountId} onChange={(e) => setForm({ ...form, glAccountId: e.target.value })}
                  className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                  <option value="">— select asset GL —</option>
                  {gl.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Opening balance</Label>
                <Input type="number" step={0.01} value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} placeholder="0.00" />
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
