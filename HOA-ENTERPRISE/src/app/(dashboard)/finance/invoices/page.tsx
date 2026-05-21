'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const statusBadgeMap: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'muted',
  sent: 'info',
  partial: 'warning',
  paid: 'success',
  voided: 'destructive',
  overdue: 'destructive',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .get<any>('/invoices')
      .then((res) => setInvoices(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      inv.unit?.unitNumber?.toLowerCase().includes(q) ||
      inv.unit?.estate?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Invoices</h1>
          <p className="mt-1 text-body text-muted-foreground">
            All levies, fines and ad-hoc charges across your community.
          </p>
        </div>
        <Link href="/finance/invoices/new">
          <Button>
            <Plus className="mr-1.5 h-4 w-4" />
            New invoice
          </Button>
        </Link>
      </header>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search invoice #, unit or estate…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
                <FileText className="h-5 w-5 text-graphite" />
              </div>
              <p className="mt-3 text-body text-charcoal-primary font-medium">
                {search ? 'No invoices match your search' : 'No invoices yet'}
              </p>
              {!search && (
                <p className="text-caption text-muted-foreground">
                  Create your first invoice to start billing residents.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Invoice #</th>
                    <th className="px-6 py-3">Unit</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3">Due</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv: any, idx: number) => (
                    <tr
                      key={inv.id}
                      className={cn(
                        'group transition-colors hover:bg-stone-surface/50',
                        idx !== filtered.length - 1 && 'border-b border-stone-surface',
                      )}
                    >
                      <td className="px-6 py-4 font-mono text-[13px] text-charcoal-primary">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-6 py-4 text-graphite">
                        <span className="font-medium text-charcoal-primary">Unit {inv.unit?.unitNumber}</span>
                        <span className="ml-1 text-muted-foreground">· {inv.unit?.estate?.name}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-charcoal-primary">
                        {formatCurrency(Number(inv.amount))}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                      <td className="px-6 py-4">
                        <Badge variant={statusBadgeMap[inv.status] || 'secondary'}>{inv.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/finance/invoices/${inv.id}`}
                          className="text-caption font-medium text-ember-orange opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
