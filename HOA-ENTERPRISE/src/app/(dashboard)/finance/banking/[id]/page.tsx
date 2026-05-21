'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Upload, Check, X, Filter, Lock } from 'lucide-react';
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

const statusFilters = ['all', 'unmatched', 'matched', 'excluded'] as const;

export default function BankAccountDetail() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [account, setAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<typeof statusFilters[number]>('unmatched');
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [matchTxn, setMatchTxn] = useState<any | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [glAccounts, setGlAccounts] = useState<any[]>([]);
  const [manualGl, setManualGl] = useState('');
  const [showRecon, setShowRecon] = useState(false);
  const [reconForm, setReconForm] = useState({ periodStart: '', periodEnd: '', statementBalance: '' });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const [a, t, r, gl] = await Promise.all([
        api.get<any>(`/banking/accounts/${id}`),
        api.get<any>(`/banking/accounts/${id}/transactions${params.toString() ? `?${params}` : ''}`),
        api.get<any>(`/banking/accounts/${id}/reconciliations`),
        api.get<any>('/finance/gl-accounts'),
      ]);
      setAccount(a.data);
      setTransactions(t.data || []);
      setReconciliations(r.data || []);
      setGlAccounts((gl.data || []).filter((g: any) => g.isActive));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, statusFilter]);

  const importCsv = async () => {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return toast({ variant: 'error', title: 'Empty CSV' });
    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const required = ['date', 'amount', 'description'];
    for (const h of required) {
      if (!headers.includes(h)) return toast({ variant: 'error', title: `Missing CSV column: ${h}` });
    }
    const dateIdx = headers.indexOf('date');
    const amtIdx = headers.indexOf('amount');
    const descIdx = headers.indexOf('description');
    const refIdx = headers.indexOf('reference');
    const extIdIdx = headers.indexOf('externalid');
    const txns: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i]);
      if (parts.length < headers.length) continue;
      const date = parts[dateIdx]?.trim();
      const amount = Number(parts[amtIdx]?.trim());
      const description = parts[descIdx]?.trim();
      if (!date || isNaN(amount) || !description) continue;
      txns.push({
        date,
        amount,
        description,
        reference: refIdx >= 0 ? parts[refIdx]?.trim() : undefined,
        externalId: extIdIdx >= 0 ? parts[extIdIdx]?.trim() : undefined,
      });
    }
    if (txns.length === 0) return toast({ variant: 'error', title: 'No valid rows in CSV' });
    setBusy(true);
    try {
      const idemp = `import-${id}-${Date.now()}`;
      const r = await api.post<any>(`/banking/accounts/${id}/transactions/import`, { transactions: txns, source: 'csv' }, idemp);
      toast({ variant: 'success', title: 'Imported', description: `${r.data.imported} new, ${r.data.autoCategorized} auto-categorized, ${r.data.skippedDuplicates} skipped` });
      setShowImport(false); setCsv('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Import failed', description: err.message });
    } finally { setBusy(false); }
  };

  const openMatch = async (t: any) => {
    setMatchTxn(t);
    setManualGl('');
    try {
      const r = await api.get<any>(`/banking/transactions/${t.id}/suggestions`);
      setSuggestions(r.data.suggestions || []);
    } catch { setSuggestions([]); }
  };

  const confirmMatch = async (suggestion: any | null) => {
    if (!matchTxn) return;
    setBusy(true);
    try {
      const idemp = `match-${matchTxn.id}-${Date.now()}`;
      const payload = suggestion
        ? { entityType: suggestion.entityType, entityId: suggestion.entityId }
        : { entityType: 'Manual', glAccountId: manualGl };
      await api.post(`/banking/transactions/${matchTxn.id}/match`, payload, idemp);
      toast({ variant: 'success', title: 'Matched', description: 'Journal entry posted' });
      setMatchTxn(null);
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Match failed', description: err.message });
    } finally { setBusy(false); }
  };

  const exclude = async (t: any) => {
    const ok = await confirm({
      title: 'Exclude transaction?',
      description: 'Excluded transactions are kept for audit but ignored in reconciliations.',
      confirmText: 'Exclude',
    });
    if (!ok) return;
    try {
      await api.post(`/banking/transactions/${t.id}/exclude`, { reason: 'Excluded by admin' });
      toast({ variant: 'success', title: 'Excluded' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Exclude failed', description: err.message });
    }
  };

  const startRecon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconForm.periodStart || !reconForm.periodEnd) return toast({ variant: 'error', title: 'Set period' });
    setBusy(true);
    try {
      await api.post(`/banking/accounts/${id}/reconciliations`, {
        periodStart: new Date(reconForm.periodStart).toISOString(),
        periodEnd: new Date(reconForm.periodEnd).toISOString(),
        statementBalance: Number(reconForm.statementBalance || 0),
      });
      toast({ variant: 'success', title: 'Reconciliation started' });
      setShowRecon(false);
      setReconForm({ periodStart: '', periodEnd: '', statementBalance: '' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Start failed', description: err.message });
    } finally { setBusy(false); }
  };

  const lockRecon = async (r: any) => {
    const ok = await confirm({
      title: 'Lock reconciliation?',
      description: 'Locking prevents further edits in this period. Unmatched transactions in period will block the lock.',
      confirmText: 'Lock',
    });
    if (!ok) return;
    try {
      await api.post(`/banking/reconciliations/${r.id}/lock`, {});
      toast({ variant: 'success', title: 'Reconciliation locked' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Lock failed', description: err.message });
    }
  };

  if (loading) return <div className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!account) return <Card><CardContent className="p-10 text-center"><p>Not found.</p></CardContent></Card>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/finance/banking" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Banking
      </Link>

      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">{account.name}</h1>
        <p className="mt-1 text-body text-muted-foreground">
          {account.bankName ? `${account.bankName} · ` : ''}{account.glAccount.code} {account.glAccount.name}
        </p>
        <div className="mt-3 flex items-center gap-6">
          <div>
            <p className="text-caption text-muted-foreground">Current balance</p>
            <p className={cn('text-heading-md font-display tabular-nums', account.currentBalance < 0 ? 'text-coral-red' : 'text-charcoal-primary')}>
              {account.currency} {Number(account.currentBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowImport(true)}><Upload className="mr-1.5 h-3.5 w-3.5" />Import statement (CSV)</Button>
        <Button variant="secondary" onClick={() => setShowRecon(true)}><Lock className="mr-1.5 h-3.5 w-3.5" />Start reconciliation</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {statusFilters.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn('rounded-pill px-3 py-1 text-caption font-medium transition-colors capitalize',
              statusFilter === s ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone')}>
            {s}
          </button>
        ))}
      </div>

      <Card><CardContent className="p-0">
        {transactions.length === 0 ? (
          <div className="p-10 text-center"><p className="text-caption text-muted-foreground">No transactions in this view</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Categorization</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={t.id} className={i !== transactions.length - 1 ? 'border-b border-stone-surface' : ''}>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(t.date)}</td>
                    <td className="px-4 py-3 text-graphite max-w-xs truncate">{t.description}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{t.reference || '—'}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums font-medium', Number(t.amount) >= 0 ? 'text-meadow-green' : 'text-coral-red')}>
                      {Number(t.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {t.status === 'matched' ? <Badge variant="success">matched</Badge> :
                       t.status === 'excluded' ? <Badge variant="muted">excluded</Badge> :
                       t.glAccount ? <Badge variant="info">{t.glAccount.code}</Badge> : <Badge variant="warning">unmatched</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.status === 'unmatched' && (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openMatch(t)} className="rounded-pill px-2 py-1 text-xs bg-midnight text-white hover:bg-midnight/90">Match</button>
                          <button onClick={() => exclude(t)} className="rounded-pill px-2 py-1 text-xs bg-stone-surface text-graphite hover:bg-card"><X className="h-3 w-3" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-6">
        <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3">Reconciliations</h3>
        {reconciliations.length === 0 ? (
          <p className="text-caption text-muted-foreground">No reconciliations yet.</p>
        ) : (
          <div className="space-y-2">
            {reconciliations.map((r) => {
              const diff = Number(r.closingBalance) - Number(r.statementBalance);
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-stone-surface/50 p-3">
                  <div>
                    <p className="text-sm text-graphite font-medium">{formatDate(r.periodStart)} – {formatDate(r.periodEnd)}</p>
                    <p className="text-caption text-muted-foreground tabular-nums">
                      Closing: {Number(r.closingBalance).toFixed(2)} · Statement: {Number(r.statementBalance).toFixed(2)} · Diff: {diff.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.status === 'locked' ? 'success' : 'warning'}>{r.status}</Badge>
                    {r.status === 'open' && (
                      <Button size="sm" variant="secondary" onClick={() => lockRecon(r)}><Lock className="h-3 w-3 mr-1" />Lock</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent></Card>

      <Drawer open={showImport} onOpenChange={setShowImport}>
        <DrawerContent size="lg">
          <DrawerHeader>
            <DrawerTitle>Import bank statement (CSV)</DrawerTitle>
            <DrawerDescription>
              Required columns: <code className="bg-stone-surface/50 px-1 rounded">date</code>, <code className="bg-stone-surface/50 px-1 rounded">amount</code>, <code className="bg-stone-surface/50 px-1 rounded">description</code>.
              Optional: <code className="bg-stone-surface/50 px-1 rounded">reference</code>, <code className="bg-stone-surface/50 px-1 rounded">externalid</code>. Positive amounts = inflow, negative = outflow.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <textarea rows={14} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={`date,amount,description,reference\n2026-05-01,1500.00,Levy payment unit 12,EFT-2026-001\n2026-05-02,-450.00,Security services,SECURE-INV-77`}
              className="flex w-full rounded-lg bg-card px-3 py-2.5 text-xs font-mono shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </DrawerBody>
          <DrawerFooter>
            <Button disabled={busy || !csv.trim()} onClick={importCsv}>{busy ? 'Importing…' : 'Import'}</Button>
            <Button variant="secondary" onClick={() => setShowImport(false)}>Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={!!matchTxn} onOpenChange={(o) => !o && setMatchTxn(null)}>
        <DrawerContent size="lg">
          <DrawerHeader>
            <DrawerTitle>Match transaction</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            {matchTxn && (
              <div className="rounded-lg bg-stone-surface/50 p-3">
                <p className="text-sm text-graphite">{matchTxn.description}</p>
                <p className="text-caption text-muted-foreground">{formatDate(matchTxn.date)} · <span className={cn('tabular-nums font-medium', Number(matchTxn.amount) >= 0 ? 'text-meadow-green' : 'text-coral-red')}>{Number(matchTxn.amount).toFixed(2)}</span></p>
              </div>
            )}

            {suggestions.length > 0 && (
              <div>
                <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground mb-2">Suggestions</p>
                <div className="space-y-2">
                  {suggestions.map((s, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-stone-surface/30 p-3">
                      <div className="min-w-0">
                        <p className="text-sm text-graphite truncate">{s.label}</p>
                        <p className="text-caption text-muted-foreground">{s.reason} · <Badge variant={s.confidence === 'high' ? 'success' : 'info'}>{s.confidence}</Badge></p>
                      </div>
                      <Button size="sm" disabled={busy} onClick={() => confirmMatch(s)}><Check className="h-3 w-3 mr-1" />Match</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground mb-2">Or assign GL manually</p>
              <select value={manualGl} onChange={(e) => setManualGl(e.target.value)}
                className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                <option value="">— select GL —</option>
                {glAccounts.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name} ({g.type})</option>)}
              </select>
              {manualGl && (
                <Button size="sm" className="mt-2" disabled={busy} onClick={() => confirmMatch(null)}>
                  <Check className="h-3 w-3 mr-1" />Confirm manual match
                </Button>
              )}
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setMatchTxn(null)}>Close</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={showRecon} onOpenChange={setShowRecon}>
        <DrawerContent size="md">
          <form onSubmit={startRecon} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>Start reconciliation</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label>Period start <span className="text-coral-red">*</span></Label><Input type="date" required value={reconForm.periodStart} onChange={(e) => setReconForm({ ...reconForm, periodStart: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Period end <span className="text-coral-red">*</span></Label><Input type="date" required value={reconForm.periodEnd} onChange={(e) => setReconForm({ ...reconForm, periodEnd: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Statement closing balance</Label>
                <Input type="number" step={0.01} value={reconForm.statementBalance} onChange={(e) => setReconForm({ ...reconForm, statementBalance: e.target.value })} placeholder="0.00" />
                <p className="text-caption text-muted-foreground">Per the bank statement. Lock will require this matches computed closing.</p>
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" disabled={busy}>{busy ? 'Starting…' : 'Start'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowRecon(false)}>Cancel</Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}
