'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
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
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

const MATCH_TYPES = ['contains', 'starts_with', 'equals', 'regex'] as const;

type Form = {
  name: string;
  matchType: typeof MATCH_TYPES[number];
  pattern: string;
  caseInsensitive: boolean;
  amountMin: string;
  amountMax: string;
  glAccountId: string;
  fundId: string;
  priority: number;
};

const blank = (): Form => ({ name: '', matchType: 'contains', pattern: '', caseInsensitive: true, amountMin: '', amountMax: '', glAccountId: '', fundId: '', priority: 100 });

export default function CategorizationRulesPage() {
  const confirm = useConfirm();
  const [rules, setRules] = useState<any[]>([]);
  const [gl, setGl] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Form>(blank());
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<any>('/banking/categorization-rules').then((r) => setRules(r.data || [])),
      api.get<any>('/finance/gl-accounts').then((r) => setGl((r.data || []).filter((g: any) => g.isActive))),
      api.get<any>('/finance/funds').then((r) => setFunds(r.data || [])),
    ]).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      name: r.name,
      matchType: r.matchType,
      pattern: r.pattern,
      caseInsensitive: r.caseInsensitive,
      amountMin: r.amountMin?.toString() ?? '',
      amountMax: r.amountMax?.toString() ?? '',
      glAccountId: r.glAccountId,
      fundId: r.fundId ?? '',
      priority: r.priority,
    });
  };
  const openNew = () => { setEditing({}); setForm(blank()); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.pattern.trim() || !form.glAccountId) {
      return toast({ variant: 'error', title: 'Name, pattern and GL account are required' });
    }
    setBusy(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        matchType: form.matchType,
        pattern: form.pattern.trim(),
        caseInsensitive: form.caseInsensitive,
        amountMin: form.amountMin ? Number(form.amountMin) : undefined,
        amountMax: form.amountMax ? Number(form.amountMax) : undefined,
        glAccountId: form.glAccountId,
        fundId: form.fundId || undefined,
        priority: form.priority,
      };
      if (editing?.id) {
        await api.put(`/banking/categorization-rules/${editing.id}`, payload);
        toast({ variant: 'success', title: 'Rule updated' });
      } else {
        await api.post('/banking/categorization-rules', payload);
        toast({ variant: 'success', title: 'Rule created' });
      }
      setEditing(null); load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally { setBusy(false); }
  };

  const remove = async (r: any) => {
    const ok = await confirm({
      title: `Deactivate "${r.name}"?`,
      description: 'Rule is soft-deleted and no longer applied to new imports. Existing categorizations are unaffected.',
      confirmText: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/banking/categorization-rules/${r.id}`);
      toast({ variant: 'success', title: 'Rule deactivated' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/finance/banking" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Banking
      </Link>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Categorization rules</h1>
          <p className="mt-1 text-body text-muted-foreground">Auto-assign GL (and optionally a fund) to imported bank transactions matching these patterns.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />Add rule</Button>
      </header>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : rules.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-body text-charcoal-primary font-medium">No rules</p>
            <p className="text-caption text-muted-foreground">Add rules to auto-categorize on import.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Pattern</th>
                  <th className="px-4 py-3">→ GL</th>
                  <th className="px-4 py-3">Hits</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-stone-surface last:border-b-0 hover:bg-stone-surface/50">
                    <td className="px-4 py-3 text-graphite tabular-nums">{r.priority}</td>
                    <td className="px-4 py-3 text-graphite font-medium cursor-pointer" onClick={() => openEdit(r)}>
                      {r.name} {!r.isActive && <Badge variant="muted" className="ml-1">inactive</Badge>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground"><code className="font-mono text-xs">{r.matchType}: {r.pattern}</code></td>
                    <td className="px-4 py-3 text-muted-foreground">{r.glAccount?.code} {r.glAccount?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{r.hits}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => remove(r)} className="text-coral-red/70 hover:text-coral-red"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>

      <Drawer open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DrawerContent size="md">
          <form onSubmit={save} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>{editing?.id ? 'Edit rule' : 'New rule'}</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name <span className="text-coral-red">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Security services payments" required />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Match type</Label>
                  <select value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value as any })}
                    className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                    {MATCH_TYPES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Pattern <span className="text-coral-red">*</span></Label>
                  <Input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} required placeholder={form.matchType === 'regex' ? '^SECURE-\\d+' : 'SECURITY'} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-caption text-muted-foreground">
                <input type="checkbox" checked={form.caseInsensitive} onChange={(e) => setForm({ ...form, caseInsensitive: e.target.checked })} />
                Case insensitive
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label>Min amount</Label><Input type="number" step={0.01} value={form.amountMin} onChange={(e) => setForm({ ...form, amountMin: e.target.value })} placeholder="optional" /></div>
                <div className="space-y-1.5"><Label>Max amount</Label><Input type="number" step={0.01} value={form.amountMax} onChange={(e) => setForm({ ...form, amountMax: e.target.value })} placeholder="optional" /></div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>GL account <span className="text-coral-red">*</span></Label>
                  <select required value={form.glAccountId} onChange={(e) => setForm({ ...form, glAccountId: e.target.value })}
                    className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                    <option value="">— select —</option>
                    {gl.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Fund (optional)</Label>
                  <select value={form.fundId} onChange={(e) => setForm({ ...form, fundId: e.target.value })}
                    className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                    <option value="">— no fund —</option>
                    {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Input type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
                <p className="text-caption text-muted-foreground">Lower priority wins. Use 10/20/30 to leave gaps.</p>
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save rule'}</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
