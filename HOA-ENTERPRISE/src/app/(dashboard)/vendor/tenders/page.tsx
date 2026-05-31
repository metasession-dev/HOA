'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gavel } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const myBidBadge: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  submitted: 'info', shortlisted: 'warning', awarded: 'success', rejected: 'destructive', withdrawn: 'secondary',
};

export default function VendorTendersPage() {
  const [tenders, setTenders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/vendor-portal/tenders').then((r) => setTenders(r.data || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const budgetText = (t: any) => {
    if (t.budgetMin != null && t.budgetMax != null) return `${formatCurrency(Number(t.budgetMin), t.currency)} – ${formatCurrency(Number(t.budgetMax), t.currency)}`;
    if (t.budgetMax != null) return `Up to ${formatCurrency(Number(t.budgetMax), t.currency)}`;
    return null;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Open tenders</h1>
        <p className="mt-1 text-body text-muted-foreground">Contract opportunities you can bid on.</p>
      </header>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : tenders.length === 0 ? (
          <div className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-surface">
              <Gavel className="h-5 w-5 text-graphite" />
            </div>
            <p className="mt-3 text-body font-medium text-charcoal-primary">No open tenders</p>
            <p className="text-caption text-muted-foreground">When the HOA opens a tender, it will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-surface">
            {tenders.map((t: any) => (
              <Link key={t.id} href={`/vendor/tenders/${t.id}`} className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-stone-surface/50">
                <div className="min-w-0">
                  <p className="font-medium text-charcoal-primary">{t.title}</p>
                  <p className="text-caption text-muted-foreground">
                    {t.category ? `${t.category} · ` : ''}Closes {formatDate(t.closesAt)}
                    {budgetText(t) ? ` · Budget ${budgetText(t)}` : ''}
                  </p>
                </div>
                {t.myBidStatus ? (
                  <Badge variant={myBidBadge[t.myBidStatus] || 'muted'}>Bid {t.myBidStatus}</Badge>
                ) : (
                  <Badge variant="secondary">Not bid yet</Badge>
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
