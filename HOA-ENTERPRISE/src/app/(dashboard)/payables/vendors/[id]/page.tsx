'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Ban, Pause, Play, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, getOrgCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';

const statusBadge: Record<string, 'success' | 'warning' | 'destructive' | 'muted'> = {
  active: 'success', suspended: 'warning', blacklisted: 'destructive',
};

export default function VendorDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const [v, setV] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<any>(`/vendors/${id}`).then((r) => setV(r.data)),
      api.get<any>(`/vendor-invoices?vendorId=${id}`).then((r) => setInvoices(r.data || [])),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const changeStatus = async (target: 'active' | 'suspended' | 'blacklisted', label: string) => {
    const ok = await confirm({
      title: `${label} vendor?`,
      description: target === 'blacklisted'
        ? 'Blacklisting prevents capturing any new invoices for this vendor. Pending invoices must be cleared first.'
        : target === 'suspended' ? 'Suspending pauses new invoice capture until reactivated.' : 'Reactivate this vendor.',
      confirmText: label,
      destructive: target === 'blacklisted',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/vendors/${id}/status`, { status: target });
      toast({ variant: 'success', title: `Vendor ${target}` });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Action failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!v) return <Card><CardContent className="p-10 text-center"><p>Not found.</p></CardContent></Card>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/payables/vendors" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Vendors
      </Link>

      <header>
        <div className="flex items-center gap-2">
          <Badge variant={statusBadge[v.status] || 'muted'}>{v.status}</Badge>
          {v.preferredCurrency !== getOrgCurrency() && <Badge variant="muted">{v.preferredCurrency}</Badge>}
        </div>
        <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">{v.name}</h1>
        <p className="mt-1 text-body text-muted-foreground">
          {v.email && <span>{v.email}</span>}{v.email && v.phone && <span> · </span>}{v.phone && <span>{v.phone}</span>}
        </p>
      </header>

      <Card><CardContent className="space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-2 text-sm">
          <Info label="Tax #" value={v.taxNumber} />
          <Info label="Company reg #" value={v.registrationNo} />
          <Info label="Bank" value={v.bankName ? `${v.bankName} — ${v.bankAccountName ?? '—'}` : null} />
          <Info label="Account" value={v.bankAccountNo ? `${v.bankAccountNo} · ${v.bankBranchCode || ''}` : null} />
          <Info label="Default GL" value={v.defaultGlAccount ? `${v.defaultGlAccount.code} · ${v.defaultGlAccount.name}` : null} />
          <Info label="Rating" value={v.rating ? `${v.rating}/5` : null} />
        </div>
        {v.notes && <div><p className="text-caption text-muted-foreground mb-1">Notes</p><p className="text-sm text-graphite whitespace-pre-wrap">{v.notes}</p></div>}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-surface">
          {v.status !== 'active' && <Button variant="secondary" disabled={busy} onClick={() => changeStatus('active', 'Activate')}><Play className="mr-1.5 h-3.5 w-3.5" />Activate</Button>}
          {v.status === 'active' && <Button variant="secondary" disabled={busy} onClick={() => changeStatus('suspended', 'Suspend')}><Pause className="mr-1.5 h-3.5 w-3.5" />Suspend</Button>}
          {v.status !== 'blacklisted' && <Button variant="destructive" disabled={busy} onClick={() => changeStatus('blacklisted', 'Blacklist')}><Ban className="mr-1.5 h-3.5 w-3.5" />Blacklist</Button>}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Recent invoices</h3>
          <Link href={`/payables/new?vendorId=${v.id}`} className="text-caption text-ember-orange hover:underline">Capture invoice →</Link>
        </div>
        {invoices.length === 0 ? (
          <p className="text-caption text-muted-foreground py-4">No invoices yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.slice(0, 10).map((inv: any) => (
              <Link key={inv.id} href={`/payables/${inv.id}`} className="flex items-center justify-between rounded-lg p-3 bg-stone-surface/50 hover:bg-stone-surface transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-graphite truncate">{inv.vendorInvoiceNo}</p>
                  <p className="text-caption text-muted-foreground">{formatDate(inv.issueDate)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm tabular-nums text-graphite">{inv.currency} {Number(inv.amount).toFixed(2)}</p>
                  <Badge variant={statusBadgeForInvoice(inv.status)}>{inv.status.replace('_', ' ')}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-graphite">{value || '—'}</p>
    </div>
  );
}

function statusBadgeForInvoice(s: string): 'muted' | 'info' | 'success' | 'destructive' | 'warning' {
  switch (s) {
    case 'paid': return 'success';
    case 'approved': return 'info';
    case 'pending_approval': return 'warning';
    case 'rejected': return 'destructive';
    case 'cancelled': return 'muted';
    default: return 'muted';
  }
}
