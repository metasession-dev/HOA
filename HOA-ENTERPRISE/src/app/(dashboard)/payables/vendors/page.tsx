'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building, Plus, Filter, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const statusFilters = ['all', 'active', 'suspended', 'blacklisted'] as const;
const statusBadge: Record<string, 'success' | 'warning' | 'destructive' | 'muted'> = {
  active: 'success',
  suspended: 'warning',
  blacklisted: 'destructive',
};

export default function VendorsListPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<typeof statusFilters[number]>('all');
  const [search, setSearch] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (search) params.set('search', search);
    setLoading(true);
    api.get<any>(`/vendors${params.toString() ? `?${params}` : ''}`).then((r) => setVendors(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Vendors</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Suppliers, contractors, and service providers. Captures bank details for payment runs.
          </p>
        </div>
        <Link href="/payables/vendors/new"><Button><Plus className="mr-1.5 h-4 w-4" />Add vendor</Button></Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {statusFilters.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn('rounded-pill px-3 py-1 text-caption font-medium transition-colors capitalize',
              statusFilter === s ? 'bg-midnight text-white' : 'bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone')}>
            {s}
          </button>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, tax #" className="pl-8 h-9 w-64" />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </div>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : vendors.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
              <Building className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">No vendors yet</p>
            <p className="text-caption text-muted-foreground">Add the first supplier to start capturing invoices.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-surface text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Tax #</th>
                  <th className="px-6 py-3">Bank</th>
                  <th className="px-6 py-3">Default GL</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v: any, idx: number) => (
                  <tr key={v.id}
                    className={cn('group transition-colors hover:bg-stone-surface/50 cursor-pointer', idx !== vendors.length - 1 && 'border-b border-stone-surface')}
                    onClick={() => router.push(`/payables/vendors/${v.id}`)}>
                    <td className="px-6 py-3 text-graphite font-medium">{v.name}</td>
                    <td className="px-6 py-3 text-muted-foreground">{v.taxNumber || '—'}</td>
                    <td className="px-6 py-3 text-muted-foreground">{v.bankName ? `${v.bankName} · ${v.bankAccountNo?.slice(-4)?.padStart(8, '•')}` : '—'}</td>
                    <td className="px-6 py-3 text-muted-foreground">{v.defaultGlAccount ? `${v.defaultGlAccount.code} ${v.defaultGlAccount.name}` : '—'}</td>
                    <td className="px-6 py-3"><Badge variant={statusBadge[v.status] || 'muted'}>{v.status}</Badge></td>
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
