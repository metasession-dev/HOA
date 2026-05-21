'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const typeAccent: Record<string, { bg: string; text: string; label: string }> = {
  asset: { bg: 'bg-sky-blue/15', text: 'text-ocean-blue', label: 'Assets' },
  liability: { bg: 'bg-coral-red/15', text: 'text-coral-red', label: 'Liabilities' },
  equity: { bg: 'bg-violet-pop/15', text: 'text-violet-pop', label: 'Equity' },
  income: { bg: 'bg-meadow-green/15', text: 'text-meadow-green', label: 'Income' },
  expense: { bg: 'bg-sunburst-yellow/20', text: 'text-deep-amber', label: 'Expenses' },
};

const order = ['asset', 'liability', 'equity', 'income', 'expense'];

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any>('/finance/gl-accounts')
      .then((res) => setAccounts(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const grouped = accounts.reduce((acc: Record<string, any[]>, a: any) => {
    if (!acc[a.type]) acc[a.type] = [];
    acc[a.type].push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
          Chart of accounts
        </h1>
        <p className="mt-1 text-body text-muted-foreground">
          Every ledger account, grouped by type. Pre-seeded for HOA workflows.
        </p>
      </header>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {order
            .filter((t) => grouped[t]?.length)
            .map((type) => {
              const accent = typeAccent[type];
              const accts = grouped[type] || [];
              return (
                <Card key={type}>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between border-b border-stone-surface px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'h-2.5 w-2.5 rounded-full',
                            accent.bg.replace('/15', '').replace('/20', ''),
                          )}
                        />
                        <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">
                          {accent.label}
                        </h2>
                      </div>
                      <Badge variant="muted">{accts.length} accounts</Badge>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-caption font-medium uppercase tracking-wider text-muted-foreground">
                          <th className="px-6 py-3">Code</th>
                          <th className="px-6 py-3">Name</th>
                          <th className="px-6 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accts.map((a: any, idx: number) => (
                          <tr
                            key={a.id}
                            className={cn(
                              'transition-colors hover:bg-stone-surface/50',
                              idx !== accts.length - 1 && 'border-b border-stone-surface',
                            )}
                          >
                            <td className="px-6 py-3 font-mono text-[13px] text-charcoal-primary">{a.code}</td>
                            <td className="px-6 py-3 text-graphite">{a.name}</td>
                            <td className="px-6 py-3">
                              {a.isActive ? (
                                <Badge variant="success">Active</Badge>
                              ) : (
                                <Badge variant="muted">Inactive</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
