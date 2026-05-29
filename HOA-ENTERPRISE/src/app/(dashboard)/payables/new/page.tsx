'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { getOrgCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { FileUpload } from '@/components/ui/file-upload';

type Line = { description: string; quantity: number; unitPrice: number; total: number; glAccountId?: string };

export default function NewVendorInvoicePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [vendors, setVendors] = useState<any[]>([]);
  const [gl, setGl] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [overrideDup, setOverrideDup] = useState(false);
  const [overrideCurrency, setOverrideCurrency] = useState(false);

  const [vendorId, setVendorId] = useState(sp.get('vendorId') ?? '');
  // Optional — the supplier's own invoice number for reconciliation against
  // their statement. We DON'T show this on the new-invoice form anymore: the
  // server auto-generates an internal reference (VINV-YYYY-NNNNN) so the user
  // doesn't have to make one up. They can add the supplier's number later via
  // the detail page if they need it.
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState(getOrgCurrency());
  const [glAccountId, setGlAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [vatAmount, setVatAmount] = useState<string>('');
  const [lines, setLines] = useState<Line[]>([{ description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  const [attachments, setAttachments] = useState<any[]>([]);

  useEffect(() => {
    api.get<any>('/vendors?status=active').then((r) => setVendors(r.data || [])).catch(() => {});
    api.get<any>('/finance/gl-accounts').then((r) => setGl((r.data || []).filter((g: any) => g.type === 'expense'))).catch(() => {});
  }, []);

  const selectedVendor = vendors.find((v) => v.id === vendorId);
  useEffect(() => {
    if (selectedVendor) {
      if (!glAccountId && selectedVendor.defaultGlAccount) setGlAccountId(selectedVendor.defaultGlAccount.id);
      setCurrency(selectedVendor.preferredCurrency || getOrgCurrency());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const total = lines.reduce((s, l) => s + l.total, 0);

  const updateLine = (i: number, patch: Partial<Line>) => {
    const next = [...lines];
    next[i] = { ...next[i], ...patch };
    next[i].total = Math.round(next[i].quantity * next[i].unitPrice * 100) / 100;
    setLines(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId) return toast({ variant: 'error', title: 'Choose a vendor' });
    if (!dueDate) return toast({ variant: 'error', title: 'Due date required' });
    if (total <= 0) return toast({ variant: 'error', title: 'Total must be > 0' });

    setBusy(true);
    try {
      // Idempotency key keys on vendor + amount + due-date so an accidental
      // double-submit returns the same invoice. We can't include
      // vendorInvoiceNo here since the server auto-generates it.
      const idemp = `vendor-inv-${vendorId}-${dueDate}-${total}`;
      const payload: any = {
        vendorId,
        // vendorInvoiceNo intentionally omitted — server auto-generates.
        amount: total,
        currency,
        vatAmount: vatAmount ? Number(vatAmount) : undefined,
        issueDate: new Date(issueDate).toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        glAccountId: glAccountId || undefined,
        lineItems: lines.filter((l) => l.description.trim() !== ''),
        attachments,
        notes: notes || undefined,
        overrideDuplicate: overrideDup,
        currencyOverride: overrideCurrency,
      };
      const r = await api.post<any>('/vendor-invoices', payload, idemp);
      // Surface the server-generated reference so the user can quote it back
      // to the supplier or paste it into reconciliation tooling.
      toast({
        variant: 'success',
        title: 'Invoice captured',
        description: `${r.data.vendorInvoiceNo} · status: ${r.data.status.replace('_', ' ')}`,
      });
      router.push(`/payables/${r.data.id}`);
    } catch (err: any) {
      const msg = err.message || 'Capture failed';
      if (msg.includes('Duplicate')) {
        toast({ variant: 'error', title: 'Duplicate detected', description: 'Tick "override duplicate" to capture anyway.' });
      } else if (msg.includes('Currency') || msg.includes('currency')) {
        toast({ variant: 'error', title: 'Currency mismatch', description: 'Tick "override currency" to proceed.' });
      } else {
        toast({ variant: 'error', title: 'Capture failed', description: msg });
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <Link href="/payables" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Payables
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Capture vendor invoice</h1>
        <p className="mt-1 text-body text-muted-foreground">Approval routing will be applied automatically based on amount and GL account.</p>
      </header>

      <form onSubmit={handleSubmit}>
        <Card><CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label>Vendor <span className="text-coral-red">*</span></Label>
            <select required value={vendorId} onChange={(e) => setVendorId(e.target.value)}
              className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
              <option value="">— select vendor —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.preferredCurrency !== getOrgCurrency() ? ` (${v.preferredCurrency})` : ''}</option>)}
            </select>
            {selectedVendor && <p className="text-caption text-muted-foreground">{selectedVendor.email || '—'}</p>}
            <p className="text-caption text-muted-foreground">A reference number is generated automatically when you save.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Issue date <span className="text-coral-red">*</span></Label>
              <Input type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Due date <span className="text-coral-red">*</span></Label>
              <Input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {/*
           * No Currency input — the value is auto-derived (vendor's preferred
           * currency if set, otherwise the org currency from Settings). The
           * actual code uses {currency} for the total + payload; we surface
           * the chosen value as read-only text so the user can SEE it without
           * being able to mis-key it.
           */}
          {currency !== getOrgCurrency() && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-caption text-deep-amber">
              This vendor prefers <strong>{currency}</strong> (org default is {getOrgCurrency()}). Tick &ldquo;override currency&rdquo; below to charge in {getOrgCurrency()} instead.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>GL account</Label>
            <select value={glAccountId} onChange={(e) => setGlAccountId(e.target.value)}
              className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
              <option value="">— none —</option>
              {gl.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, { description: '', quantity: 1, unitPrice: 0, total: 0 }])}>
                <Plus className="h-3 w-3 mr-1" />Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <Input className="col-span-6" placeholder="Description" value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                  <Input className="col-span-2 tabular-nums" type="number" min={0} step={0.01} placeholder="Qty" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
                  <Input className="col-span-2 tabular-nums" type="number" min={0} step={0.01} placeholder="Unit price" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} />
                  <div className="col-span-1 flex h-10 items-center justify-end text-sm tabular-nums text-graphite">{l.total.toFixed(2)}</div>
                  <button type="button" className="col-span-1 flex h-10 items-center justify-center text-muted-foreground hover:text-coral-red"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>VAT amount (optional)</Label>
              <Input type="number" step={0.01} min={0} value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex h-10 items-end justify-end">
              <p className="text-heading-sm font-display tabular-nums text-charcoal-primary">{currency} {total.toFixed(2)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </div>

          <div className="space-y-1.5">
            <Label>Attachments</Label>
            <FileUpload value={attachments} onChange={setAttachments} maxFiles={10} kind="vendor_invoice" accept={['application/pdf', 'image/jpeg', 'image/png']} />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <label className="flex items-center gap-2 text-caption text-muted-foreground">
              <input type="checkbox" checked={overrideDup} onChange={(e) => setOverrideDup(e.target.checked)} />
              Override duplicate detection
            </label>
            <label className="flex items-center gap-2 text-caption text-muted-foreground">
              <input type="checkbox" checked={overrideCurrency} onChange={(e) => setOverrideCurrency(e.target.checked)} />
              Override currency mismatch
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-surface">
            <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" loading={busy}>{busy ? 'Capturing…' : 'Capture invoice'}</Button>
          </div>
        </CardContent></Card>
      </form>
    </div>
  );
}
