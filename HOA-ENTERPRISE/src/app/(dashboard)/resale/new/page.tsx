'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { FileUpload } from '@/components/ui/file-upload';

const DEFAULT_DISCLOSURES = [
  'Outstanding levies disclosed',
  'AGM minutes provided',
  'House rules acknowledged',
  'Pending special levies disclosed',
  'Pending architectural decisions',
  'Insurance certificate attached',
];

export default function NewResalePage() {
  const router = useRouter();
  const [estates, setEstates] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const [estateId, setEstateId] = useState('');
  const [unitId, setUnitId] = useState('');

  const [attorneyFirm, setAttorneyFirm] = useState('');
  const [attorneyContact, setAttorneyContact] = useState('');
  const [attorneyEmail, setAttorneyEmail] = useState('');
  const [attorneyPhone, setAttorneyPhone] = useState('');
  const [attorneyRef, setAttorneyRef] = useState('');

  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');

  const [transferLevyAmount, setTransferLevyAmount] = useState('');
  const [feeAmount, setFeeAmount] = useState('500');
  const [rush, setRush] = useState(false);
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);

  const [checklist, setChecklist] = useState(DEFAULT_DISCLOSURES.map((label) => ({ label, present: false, notes: '' })));

  useEffect(() => {
    api.get<any>('/estates').then((r) => setEstates(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!estateId) return setUnits([]);
    api.get<any>(`/estates/${estateId}/units`).then((r) => setUnits(r.data || [])).catch(() => {});
  }, [estateId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId) return toast({ variant: 'error', title: 'Choose a unit' });
    if (!transferLevyAmount) return toast({ variant: 'error', title: 'Transfer levy amount required' });
    setBusy(true);
    try {
      const payload: any = {
        unitId,
        transferLevyAmount: Number(transferLevyAmount),
        feeAmount: feeAmount ? Number(feeAmount) : 0,
        rushProcessing: rush,
        notes: notes || undefined,
        disclosureChecklist: checklist.map((c) => ({ label: c.label, present: c.present, notes: c.notes || undefined })),
        attachments,
      };
      if (attorneyFirm.trim()) {
        payload.transferAttorney = {
          firmName: attorneyFirm.trim(),
          contactName: attorneyContact || undefined,
          email: attorneyEmail || undefined,
          phone: attorneyPhone || undefined,
          fileReference: attorneyRef || undefined,
        };
      }
      if (buyerName.trim()) payload.buyer = { fullName: buyerName.trim(), email: buyerEmail || undefined };
      if (sellerName.trim()) payload.seller = { fullName: sellerName.trim(), email: sellerEmail || undefined };

      const r = await api.post<any>('/resale', payload);
      toast({ variant: 'success', title: 'Resale certificate created', description: r.data.certificateNumber });
      router.push(`/resale/${r.data.id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Create failed', description: err.message });
    } finally { setBusy(false); }
  };

  const updateCheck = (i: number, patch: Partial<{ present: boolean; notes: string; label: string }>) => {
    const next = [...checklist];
    next[i] = { ...next[i], ...patch };
    setChecklist(next);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/resale" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Resale
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">New resale certificate</h1>
        <p className="mt-1 text-body text-muted-foreground">A financial snapshot is captured automatically. Refresh or issue later.</p>
      </header>

      <form onSubmit={submit}>
        <Card><CardContent className="space-y-5 p-6">
          <Section title="Unit">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Estate <span className="text-coral-red">*</span></Label>
                <select required value={estateId} onChange={(e) => { setEstateId(e.target.value); setUnitId(''); }}
                  className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                  <option value="">— select estate —</option>
                  {estates.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Unit <span className="text-coral-red">*</span></Label>
                <select required value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!estateId}
                  className="flex h-10 w-full rounded-lg bg-card px-3 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50">
                  <option value="">{estateId ? '— select unit —' : 'pick estate first'}</option>
                  {units.map((u) => <option key={u.id} value={u.id}>Unit {u.unitNumber}{u.block ? ` (Block ${u.block})` : ''}</option>)}
                </select>
              </div>
            </div>
          </Section>

          <Section title="Transfer attorney">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Firm</Label><Input value={attorneyFirm} onChange={(e) => setAttorneyFirm(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Contact name</Label><Input value={attorneyContact} onChange={(e) => setAttorneyContact(e.target.value)} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={attorneyEmail} onChange={(e) => setAttorneyEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={attorneyPhone} onChange={(e) => setAttorneyPhone(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>File reference</Label><Input value={attorneyRef} onChange={(e) => setAttorneyRef(e.target.value)} /></div>
            </div>
          </Section>

          <Section title="Parties">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Buyer name</Label><Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Buyer email</Label><Input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Seller name</Label><Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Seller email</Label><Input type="email" value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} /></div>
            </div>
          </Section>

          <Section title="Amounts">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5"><Label>Transfer levy <span className="text-coral-red">*</span></Label><Input type="number" required min={0} step={0.01} value={transferLevyAmount} onChange={(e) => setTransferLevyAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Admin fee</Label><Input type="number" min={0} step={0.01} value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} /></div>
              <div className="space-y-1.5 flex items-end">
                <label className="flex items-center gap-2 text-sm text-graphite">
                  <input type="checkbox" checked={rush} onChange={(e) => setRush(e.target.checked)} />
                  Rush processing (3-day SLA)
                </label>
              </div>
            </div>
          </Section>

          <Section title="Disclosure checklist">
            <div className="space-y-2">
              {checklist.map((c, i) => (
                <div key={i} className="rounded-lg bg-stone-surface/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-graphite flex-1">
                      <input type="checkbox" checked={c.present} onChange={(e) => updateCheck(i, { present: e.target.checked })} />
                      <Input value={c.label} onChange={(e) => updateCheck(i, { label: e.target.value })} className="h-8" />
                    </label>
                    <button type="button" onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-coral-red"><X className="h-4 w-4" /></button>
                  </div>
                  {c.present && (
                    <Input placeholder="Notes (optional)" value={c.notes} onChange={(e) => updateCheck(i, { notes: e.target.value })} className="h-8 text-xs" />
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setChecklist([...checklist, { label: 'New item', present: false, notes: '' }])}>
                <Plus className="h-3 w-3 mr-1" />Add item
              </Button>
            </div>
          </Section>

          <Section title="Attachments">
            <FileUpload value={attachments} onChange={setAttachments} maxFiles={10} kind="resale_attachment" accept={['application/pdf', 'image/jpeg', 'image/png']} />
          </Section>

          <Section title="Notes">
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </Section>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-surface">
            <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create draft'}</Button>
          </div>
        </CardContent></Card>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
