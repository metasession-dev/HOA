'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, FileText, Trash2, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';

// An invoice can be deleted only if no money has been received against it.
const canDelete = (inv: any) => Number(inv.amountPaid ?? 0) === 0 && inv.status !== 'paid' && inv.status !== 'partial';

const statusBadgeMap: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'muted',
  sent: 'info',
  partial: 'warning',
  paid: 'success',
  voided: 'destructive',
  overdue: 'destructive',
};

export default function InvoicesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<any>('/invoices')
      .then((res) => setInvoices(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      inv.unit?.unitNumber?.toLowerCase().includes(q) ||
      inv.unit?.estate?.name?.toLowerCase().includes(q)
    );
  }), [invoices, search]);

  const deletableFiltered = filtered.filter(canDelete);
  const allDeletableSelected = deletableFiltered.length > 0 && deletableFiltered.every((i) => selected.has(i.id));

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allDeletableSelected ? new Set() : new Set(deletableFiltered.map((i) => i.id)));

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Delete ${ids.length} unpaid invoice(s)?`,
      description: 'This permanently removes the selected unpaid invoices. Invoices that have received any payment are skipped.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const r = await api.post<any>('/invoices/bulk-delete', { ids });
      toast({ variant: 'success', title: 'Invoices deleted', description: `${r.data.deleted} removed${r.data.skipped ? ` · ${r.data.skipped} skipped (had payments)` : ''}` });
      setSelected(new Set());
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Delete failed', description: err.message });
    } finally {
      setDeleting(false);
    }
  };

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search invoice #, unit or estate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {selected.size > 0 && (
          <Button variant="destructive" disabled={deleting} onClick={deleteSelected}>
            <Trash2 className="mr-1.5 h-4 w-4" />Delete {selected.size} selected
          </Button>
        )}
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
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={allDeletableSelected}
                        onChange={toggleAll}
                        disabled={deletableFiltered.length === 0}
                        title="Select all deletable (unpaid)"
                      />
                    </th>
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
                      onClick={() => router.push(`/finance/invoices/${inv.id}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/finance/invoices/${inv.id}`); }}
                      className={cn(
                        'group cursor-pointer transition-colors hover:bg-stone-surface/60 focus:bg-stone-surface/60 focus:outline-none',
                        idx !== filtered.length - 1 && 'border-b border-stone-surface',
                        selected.has(inv.id) && 'bg-stone-surface/40',
                      )}
                    >
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selected.has(inv.id)}
                          onChange={() => toggle(inv.id)}
                          disabled={!canDelete(inv)}
                          title={canDelete(inv) ? 'Select to delete' : 'Only unpaid invoices can be deleted'}
                        />
                      </td>
                      <td className="px-6 py-4 font-mono text-[13px] font-medium text-charcoal-primary group-hover:text-ember-orange group-hover:underline">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-6 py-4 text-graphite">
                        <span className="font-medium text-charcoal-primary">Unit {inv.unit?.unitNumber}</span>
                        <span className="ml-1 text-muted-foreground">· {inv.unit?.estate?.name}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium tabular-nums text-charcoal-primary">
                        {formatCurrency(Number(inv.amount))}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                      <td className="px-6 py-4">
                        <Badge variant={statusBadgeMap[inv.status] || 'secondary'}>{inv.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-1 text-caption font-medium text-muted-foreground transition-colors group-hover:text-ember-orange">
                          <span className="hidden sm:inline">View</span>
                          <ChevronRight className="h-4 w-4" />
                        </span>
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
