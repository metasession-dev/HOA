'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getOrgCurrency } from '@/lib/utils';
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

const ROLES = ['finance_officer', 'hoa_admin', 'exco_member', 'exco_chairperson'] as const;
const MODES = ['any', 'all', 'sequential'] as const;

type Form = {
  name: string;
  minAmount: string;
  maxAmount: string;
  currency: string;
  requiredRoles: string[];
  approverCount: number;
  mode: typeof MODES[number];
  priority: number;
};

const blank = (): Form => ({
  name: '', minAmount: '', maxAmount: '', currency: getOrgCurrency(),
  requiredRoles: ['finance_officer'], approverCount: 1, mode: 'any', priority: 100,
});

export default function ApprovalRulesPage() {
  const confirm = useConfirm();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Form>(blank());
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<any>('/approval-rules').then((r) => setRules(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      name: r.name,
      minAmount: r.minAmount?.toString() ?? '',
      maxAmount: r.maxAmount?.toString() ?? '',
      currency: r.currency,
      requiredRoles: r.requiredRoles,
      approverCount: r.approverCount,
      mode: r.mode,
      priority: r.priority,
    });
  };

  const openNew = () => { setEditing({}); setForm(blank()); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast({ variant: 'error', title: 'Name required' });
    if (form.requiredRoles.length === 0) return toast({ variant: 'error', title: 'At least one role required' });
    setBusy(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        minAmount: form.minAmount ? Number(form.minAmount) : undefined,
        maxAmount: form.maxAmount ? Number(form.maxAmount) : undefined,
        currency: form.currency || getOrgCurrency(),
        requiredRoles: form.requiredRoles,
        approverCount: form.approverCount,
        mode: form.mode,
        priority: form.priority,
      };
      if (editing?.id) {
        await api.put(`/approval-rules/${editing.id}`, payload);
        toast({ variant: 'success', title: 'Rule updated' });
      } else {
        await api.post('/approval-rules', payload);
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
      description: 'The rule is soft-deleted and no longer used for new invoices. Existing approvals are unaffected.',
      confirmText: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/approval-rules/${r.id}`);
      toast({ variant: 'success', title: 'Rule deactivated' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const fmtRange = (r: any) => {
    const min = r.minAmount ? `R ${Number(r.minAmount).toLocaleString()}` : '0';
    const max = r.maxAmount ? `R ${Number(r.maxAmount).toLocaleString()}` : '∞';
    return `${min} – ${max}`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/payables" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Payables
      </Link>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Approval rules</h1>
          <p className="mt-1 text-body text-muted-foreground">Decide who must approve invoices based on amount and account.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />Add rule</Button>
      </header>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : rules.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-body text-charcoal-primary font-medium">No rules</p>
            <p className="text-caption text-muted-foreground">Invoices will stay in "captured" until you define routing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Priority</th>
                  <th className="px-6 py-3">Rule</th>
                  <th className="px-6 py-3">Amount range</th>
                  <th className="px-6 py-3">Roles</th>
                  <th className="px-6 py-3">Mode</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-stone-surface last:border-b-0 hover:bg-stone-surface/50">
                    <td className="px-6 py-3 text-graphite tabular-nums">{r.priority}</td>
                    <td className="px-6 py-3 text-graphite font-medium cursor-pointer" onClick={() => openEdit(r)}>{r.name}</td>
                    <td className="px-6 py-3 text-muted-foreground tabular-nums">{fmtRange(r)}</td>
                    <td className="px-6 py-3 text-muted-foreground">{r.requiredRoles.join(', ')}</td>
                    <td className="px-6 py-3"><Badge variant="muted">{r.mode} ({r.approverCount})</Badge></td>
                    <td className="px-6 py-3 text-right">
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
              <DrawerDescription>
                Lower priority numbers match first. Use 10/20/30 to leave gaps for future rules.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name <span className="text-coral-red">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label>Min amount (optional)</Label><Input type="number" min={0} step={0.01} value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Max amount (optional)</Label><Input type="number" min={0} step={0.01} value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Required roles <span className="text-coral-red">*</span></Label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map((r) => {
                    const sel = form.requiredRoles.includes(r);
                    return (
                      <button key={r} type="button" onClick={() => setForm({ ...form, requiredRoles: sel ? form.requiredRoles.filter((x) => x !== r) : [...form.requiredRoles, r] })}
                        className={`rounded-pill px-3 py-1 text-caption font-medium transition-colors ${sel ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone'}`}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Mode</Label>
                  <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as any })}
                    className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                    {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><Label>Approver count</Label><Input type="number" min={1} max={10} value={form.approverCount} onChange={(e) => setForm({ ...form, approverCount: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Priority</Label><Input type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></div>
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
