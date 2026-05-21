'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { getOrgCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

export default function NewVendorPage() {
  const router = useRouter();
  const [glAccounts, setGlAccounts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    taxNumber: '', registrationNo: '',
    bankAccountName: '', bankName: '', bankAccountNo: '', bankBranchCode: '',
    preferredCurrency: getOrgCurrency(),
    defaultGlAccountId: '',
    notes: '',
  });

  useEffect(() => {
    api.get<any>('/finance/gl-accounts').then((r) => setGlAccounts((r.data || []).filter((g: any) => g.type === 'expense'))).catch(() => {});
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast({ variant: 'error', title: 'Name is required' });
    setBusy(true);
    try {
      const payload: any = {};
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === 'string' && v.trim() === '') continue;
        payload[k] = v;
      }
      const r = await api.post<any>('/vendors', payload);
      toast({ variant: 'success', title: 'Vendor added', description: form.name });
      router.push(`/payables/vendors/${r.data.id}`);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Add failed', description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/payables/vendors" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Vendors
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Add vendor</h1>
        <p className="mt-1 text-body text-muted-foreground">Capture bank and tax details now to streamline invoice and payment workflows.</p>
      </header>

      <form onSubmit={handleSubmit}>
        <Card><CardContent className="space-y-5 p-6">
          <Section title="Identity">
            <Field label="Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tax number"><Input value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} /></Field>
              <Field label="Company reg #"><Input value={form.registrationNo} onChange={(e) => set('registrationNo', e.target.value)} /></Field>
            </div>
          </Section>

          <Section title="Banking">
            <Field label="Account name"><Input value={form.bankAccountName} onChange={(e) => set('bankAccountName', e.target.value)} /></Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Bank"><Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} /></Field>
              <Field label="Account #"><Input value={form.bankAccountNo} onChange={(e) => set('bankAccountNo', e.target.value)} /></Field>
              <Field label="Branch code"><Input value={form.bankBranchCode} onChange={(e) => set('bankBranchCode', e.target.value)} /></Field>
            </div>
          </Section>

          <Section title="Defaults">
            {/*
             * Preferred currency is not editable here — it's set automatically
             * from the org currency (Settings). For the rare case where a
             * vendor must be paid in a different currency, change it on the
             * vendor detail page after creation.
             */}
            <div className="grid gap-3 md:grid-cols-1">
              <Field label="Default GL account">
                <select className="flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  value={form.defaultGlAccountId} onChange={(e) => set('defaultGlAccountId', e.target.value)}>
                  <option value="">— none —</option>
                  {glAccounts.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Notes">
            <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)}
              className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </Section>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add vendor'}</Button>
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-coral-red ml-1">*</span>}</Label>
      {children}
    </div>
  );
}
