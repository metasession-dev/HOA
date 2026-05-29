'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Building2, Landmark, Settings2, StickyNote } from 'lucide-react';
import { api } from '@/lib/api';
import { getOrgCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

  const selectClass =
    'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

  return (
    <div className="space-y-6">
      <Link href="/payables/vendors" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Vendors
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Add vendor</h1>
          <p className="mt-1 text-body text-muted-foreground">Capture bank and tax details now to streamline invoice and payment workflows.</p>
        </div>
        <Badge variant="muted">Pays in {form.preferredCurrency}</Badge>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard icon={Building2} title="Identity" subtitle="How this vendor appears across payables.">
            <Field label="Name" required>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Acme Maintenance Ltd" required autoFocus />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="accounts@acme.co.za" /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+27 …" /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tax number"><Input value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} /></Field>
              <Field label="Company reg #"><Input value={form.registrationNo} onChange={(e) => set('registrationNo', e.target.value)} /></Field>
            </div>
          </SectionCard>

          <SectionCard icon={Landmark} title="Banking" subtitle="Used to pre-fill payment runs and remittances.">
            <Field label="Account name"><Input value={form.bankAccountName} onChange={(e) => set('bankAccountName', e.target.value)} placeholder="Account holder" /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Bank"><Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} /></Field>
              <Field label="Account #"><Input value={form.bankAccountNo} onChange={(e) => set('bankAccountNo', e.target.value)} /></Field>
              <Field label="Branch code"><Input value={form.bankBranchCode} onChange={(e) => set('bankBranchCode', e.target.value)} /></Field>
            </div>
          </SectionCard>

          <SectionCard icon={Settings2} title="Defaults" subtitle="Applied automatically when capturing this vendor's invoices.">
            <Field label="Default expense account">
              <select className={selectClass} value={form.defaultGlAccountId} onChange={(e) => set('defaultGlAccountId', e.target.value)}>
                <option value="">— none —</option>
                {glAccounts.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
              </select>
            </Field>
            <Field label="Payment currency">
              <div className="flex h-10 items-center rounded-lg bg-stone-surface/60 px-3 text-sm text-graphite shadow-inset-stone">
                {form.preferredCurrency} <span className="ml-2 text-caption text-muted-foreground">· from org settings</span>
              </div>
              <p className="text-caption text-muted-foreground">Need a different currency? Change it on the vendor’s page after creating it.</p>
            </Field>
          </SectionCard>

          <SectionCard icon={StickyNote} title="Notes" subtitle="Internal context — never shown to the vendor.">
            <textarea rows={6} value={form.notes} onChange={(e) => set('notes', e.target.value)}
              placeholder="Preferred contact, SLAs, contract reference…"
              className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </SectionCard>
        </div>

        <div className="flex justify-end gap-2 border-t border-stone-surface pt-4">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" loading={busy}>{busy ? 'Saving…' : 'Add vendor'}</Button>
        </div>
      </form>
    </div>
  );
}

function SectionCard({ icon: Icon, title, subtitle, children }: { icon: any; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-icon bg-stone-surface text-graphite">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h3 className="text-heading-sm font-medium text-charcoal-primary">{title}</h3>
            {subtitle && <p className="text-caption text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="space-y-3">{children}</div>
      </CardContent>
    </Card>
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
