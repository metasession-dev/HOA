'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Receipt, Plus, Filter, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const statusFilters = ['all', 'pending_approval', 'approved', 'paid', 'rejected'] as const;
const statusBadge: Record<string, 'muted' | 'info' | 'success' | 'warning' | 'destructive'> = {
  captured: 'muted',
  pending_approval: 'warning',
  approved: 'info',
  paid: 'success',
  rejected: 'destructive',
  cancelled: 'muted',
};

export default function PayablesListPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<typeof statusFilters[number]>('all');
  const [mineOnly, setMineOnly] = useState(false);

  const load = () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (mineOnly) params.set('mineToApprove', 'true');
    setLoading(true);
    api.get<any>(`/vendor-invoices${params.toString() ? `?${params}` : ''}`).then((r) => setItems(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, mineOnly]);

  const pendingForMe = items.filter((i) => i.status === 'pending_approval').length;
  const approvedTotal = items.filter((i) => i.status === 'approved').reduce((sum, i) => sum + Number(i.amount), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Payables</h1>
          <p className="mt-1 text-body text-muted-foreground">Vendor invoice capture, approval routing, and payment runs.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/payables/approval-rules"><Button variant="secondary">Approval rules</Button></Link>
          <Link href="/payables/batch-pay"><Button variant="secondary">Batch pay</Button></Link>
          <Link href="/payables/new"><Button><Plus className="mr-1.5 h-4 w-4" />Capture invoice</Button></Link>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Pending approval" value={String(pendingForMe)} icon={AlertTriangle} tone="warning" />
        <StatCard label="Approved, awaiting payment" value={`R ${approvedTotal.toFixed(2)}`} icon={CheckCircle2} tone="info" />
        <StatCard label="Total this view" value={String(items.length)} icon={Receipt} tone="default" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {statusFilters.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn('rounded-pill px-3 py-1 text-caption font-medium transition-colors capitalize',
              statusFilter === s ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone')}>
            {s.replace('_', ' ')}
          </button>
        ))}
        <button onClick={() => setMineOnly(!mineOnly)}
          className={cn('ml-auto rounded-pill px-3 py-1 text-caption font-medium transition-colors',
            mineOnly ? 'bg-ember-orange text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone')}>
          {mineOnly ? '✓ ' : ''}Mine to approve
        </button>
      </div>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
              <Receipt className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No invoices</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Vendor</th>
                  <th className="px-6 py-3">Invoice #</th>
                  <th className="px-6 py-3">Issue</th>
                  <th className="px-6 py-3">Due</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv, idx) => (
                  <tr key={inv.id}
                    className={cn('group cursor-pointer hover:bg-stone-surface/50 transition-colors', idx !== items.length - 1 && 'border-b border-stone-surface')}
                    onClick={() => router.push(`/payables/${inv.id}`)}>
                    <td className="px-6 py-3 text-graphite font-medium">{inv.vendor?.name}</td>
                    <td className="px-6 py-3 text-muted-foreground">{inv.vendorInvoiceNo}</td>
                    <td className="px-6 py-3 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                    <td className="px-6 py-3 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                    <td className="px-6 py-3 text-graphite tabular-nums text-right">{inv.currency} {Number(inv.amount).toFixed(2)}</td>
                    <td className="px-6 py-3"><Badge variant={statusBadge[inv.status] || 'muted'}>{inv.status.replace('_', ' ')}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: 'default' | 'warning' | 'info' }) {
  const toneClass = tone === 'warning' ? 'text-deep-amber' : tone === 'info' ? 'text-ember-orange' : 'text-graphite/70';
  return (
    <Card><CardContent className="flex items-center gap-3 p-4">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg bg-stone-surface', toneClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="text-heading-sm font-display font-medium text-charcoal-primary tabular-nums">{value}</p>
      </div>
    </CardContent></Card>
  );
}
