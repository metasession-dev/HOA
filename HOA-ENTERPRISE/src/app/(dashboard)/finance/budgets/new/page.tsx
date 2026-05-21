'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus, Split, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

type LineRow = { glAccountId: string; amounts: number[]; notes: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const blankLine = (): LineRow => ({ glAccountId: '', amounts: Array(12).fill(0), notes: '' });

export default function NewBudgetPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [fiscalYear, setFiscalYear] = useState(new Date().getUTCFullYear());
  const [fundId, setFundId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([blankLine()]);

  const [funds, setFunds] = useState<any[]>([]);
  const [glAccounts, setGlAccounts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<any>('/finance/funds'),
      api.get<any>('/finance/gl-accounts'),
    ]).then(([f, g]) => {
      setFunds(f.data || []);
      setGlAccounts((g.data || []).filter((a: any) => a.type === 'income' || a.type === 'expense'));
    }).catch(() => {});
  }, []);

  const updateLine = (i: number, patch: Partial<LineRow>) => {
    const next = [...lines];
    next[i] = { ...next[i], ...patch };
    setLines(next);
  };

  const updateLineAmount = (i: number, monthIdx: number, value: number) => {
    const next = [...lines];
    const newAmounts = [...next[i].amounts];
    newAmounts[monthIdx] = isNaN(value) ? 0 : value;
    next[i] = { ...next[i], amounts: newAmounts };
    setLines(next);
  };

  const lineTotal = (l: LineRow) => l.amounts.reduce((s, a) => s + a, 0);
  const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  /**
   * Spreads the row's current total evenly across all 12 months. We use the
   * SUM of whatever the user has typed (single month, several months, all of
   * them) so the affordance "type in any month then spread" works regardless
   * of where they typed it. The Dec slot absorbs the rounding remainder so
   * `12 × monthly` always equals the original total to the cent.
   */
  const spreadRow = (i: number) => {
    const row = lines[i];
    const total = lineTotal(row);
    if (total <= 0) {
      toast({
        variant: 'error',
        title: 'Nothing to spread',
        description: 'Enter an amount in any month first, then click Spread.',
      });
      return;
    }
    const monthly = Math.round((total / 12) * 100) / 100;
    const lastMonth = Math.round((total - monthly * 11) * 100) / 100;
    const next = [...lines];
    next[i] = { ...row, amounts: [...Array(11).fill(monthly), lastMonth] };
    setLines(next);
    toast({
      variant: 'success',
      title: 'Spread across 12 months',
      description: `${total.toFixed(2)} → ${monthly.toFixed(2)} per month.`,
    });
  };

  const spreadAll = () => {
    const candidates = lines
      .map((l, i) => ({ i, total: lineTotal(l) }))
      .filter((x) => x.total > 0);
    if (candidates.length === 0) {
      toast({
        variant: 'error',
        title: 'Nothing to spread',
        description: 'Enter an amount in at least one row first.',
      });
      return;
    }
    const next = [...lines];
    for (const { i, total } of candidates) {
      const monthly = Math.round((total / 12) * 100) / 100;
      const lastMonth = Math.round((total - monthly * 11) * 100) / 100;
      next[i] = { ...next[i], amounts: [...Array(11).fill(monthly), lastMonth] };
    }
    setLines(next);
    toast({
      variant: 'success',
      title: `Spread ${candidates.length} row${candidates.length === 1 ? '' : 's'}`,
      description: 'Each row\'s total was divided equally across Jan–Dec.',
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast({ variant: 'error', title: 'Name required' });
    const filledLines = lines.filter((l) => l.glAccountId);
    if (filledLines.length === 0) return toast({ variant: 'error', title: 'At least one line required' });
    setBusy(true);
    try {
      // Currency is intentionally omitted — the server resolves it from
      // Organization.currency (the source of truth). Sending the client-cached
      // getOrgCurrency() here was unreliable: the cache only refreshes when
      // OrgSettingsProvider's useEffect re-runs, so a user who'd just changed
      // their currency in /settings would still create budgets tagged with
      // the stale ZAR default until the next full page load.
      const r = await api.post<any>('/finance/budgets', {
        name: name.trim(),
        fiscalYear,
        fundId: fundId || undefined,
        notes: notes || undefined,
        lines: filledLines.map((l) => ({ glAccountId: l.glAccountId, amounts: l.amounts, notes: l.notes || undefined })),
      });
      toast({ variant: 'success', title: 'Budget created', description: name });
      router.push(`/finance/budgets/${r.data.id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Create failed', description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/finance/budgets" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Budgets
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">New budget</h1>
        <p className="mt-1 text-body text-muted-foreground">12 months per GL account. Activate when approved; only one active budget per fiscal year + fund.</p>
      </header>

      <form onSubmit={submit}>
        <Card><CardContent className="space-y-5 p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Name <span className="text-coral-red">*</span></Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="FY 2026 operating budget" />
            </div>
            <div className="space-y-1.5">
              <Label>Fiscal year</Label>
              <Input type="number" min={2020} max={2100} value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Fund (optional)</Label>
              <select value={fundId} onChange={(e) => setFundId(e.target.value)}
                className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                <option value="">— no fund —</option>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.type})</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lines</Label>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={spreadAll}>
                  <Split className="h-3 w-3 mr-1" />Spread all
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, blankLine()])}>
                  <Plus className="h-3 w-3 mr-1" />Add line
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg bg-stone-surface/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-surface text-left text-caption text-muted-foreground">
                    <th className="px-2 py-2 w-64">GL account</th>
                    {MONTHS.map((m) => <th key={m} className="px-1 py-2 text-right w-16">{m}</th>)}
                    <th className="px-2 py-2 text-right w-24">Total</th>
                    <th className="w-8 px-1 py-2 text-center" title="Spread the row total evenly across 12 months">⇄</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const rowTotal = lineTotal(l);
                    const canSpread = rowTotal > 0;
                    return (
                      <tr key={i} className="border-b border-stone-surface last:border-b-0">
                        <td className="px-2 py-1">
                          <select value={l.glAccountId} onChange={(e) => updateLine(i, { glAccountId: e.target.value })}
                            className="w-full h-8 rounded bg-card px-2 text-xs shadow-inset-stone focus-visible:outline-none">
                            <option value="">— select —</option>
                            {glAccounts.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                          </select>
                        </td>
                        {l.amounts.map((amt, m) => (
                          <td key={m} className="px-0.5 py-1">
                            <Input type="number" step={0.01} value={amt}
                              onChange={(e) => updateLineAmount(i, m, Number(e.target.value))}
                              className="h-8 px-1 text-xs text-right tabular-nums" />
                          </td>
                        ))}
                        <td className="px-2 py-1 text-right tabular-nums text-graphite font-medium">{rowTotal.toFixed(2)}</td>
                        <td className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => spreadRow(i)}
                            disabled={!canSpread}
                            title={canSpread ? `Spread ${rowTotal.toFixed(2)} evenly across Jan–Dec` : 'Enter an amount first'}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-card hover:text-ember-orange disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Spread row total across 12 months"
                          >
                            <Split className="h-3.5 w-3.5" />
                          </button>
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => setLines(lines.filter((_, j) => j !== i))}
                            className="text-muted-foreground hover:text-coral-red"
                            aria-label="Remove line"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-stone-surface bg-card">
                    <td className="px-2 py-2 text-right text-caption text-muted-foreground" colSpan={13}>Grand total</td>
                    <td className="px-2 py-2 text-right tabular-nums text-charcoal-primary font-medium">{formatCurrency(grandTotal)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-caption text-muted-foreground">
              Tip: type the annual total in any month (say <span className="font-medium text-graphite">Jan</span>), then click the{' '}
              <Split className="inline h-3 w-3 -translate-y-px text-ember-orange" />{' '}
              icon on that row to spread it evenly across 12 months. Use <span className="font-medium text-graphite">Spread all</span> to do every row at once.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-surface">
            <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create draft'}</Button>
          </div>
        </CardContent></Card>
      </form>
    </div>
  );
}
