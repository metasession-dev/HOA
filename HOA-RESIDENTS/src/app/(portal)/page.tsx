'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Receipt, Bell, FileText, CreditCard, ArrowUpRight, KeyRound, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { Card, CardContent, CardWarm } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { residentInvoiceStatus } from '@/lib/invoice-status';

export default function ResidentDashboard() {
  const { user, organizationName } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/dashboard?range=month').then((r) => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const stats = data?.stats || { invoicesDue: 0, totalOutstanding: 0, openPasses: 0, openViolations: 0 };
  const invoices = data?.activity?.recentInvoices || [];
  const notices = data?.activity?.recentNotices || [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-caption uppercase tracking-[0.16em] text-muted-foreground">{organizationName}</p>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}.
        </h1>
        <p className="mt-1 text-body text-muted-foreground">Your community at a glance.</p>
      </header>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-end justify-between gap-6 p-8">
          <div className="min-w-0 max-w-full">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Outstanding balance</p>
            {/* Switched from <p> to <div> so the loading Skeleton (a div) can
                nest inside without tripping React's validateDOMNesting.
                Font scales with viewport (clamp) and the container can shrink
                (min-w-0 + break-words) so a large balance never overflows the
                card on narrow screens. */}
            <div className="mt-2 font-display text-[clamp(2rem,9vw,52px)] leading-none font-medium tracking-tight tabular-nums break-words text-charcoal-primary">
              {loading ? <Skeleton className="h-12 w-48 inline-block" /> : formatCurrency(stats.totalOutstanding)}
            </div>
            <p className="mt-2 text-caption text-muted-foreground">{stats.invoicesDue} invoice(s) awaiting payment</p>
          </div>
          <Link href="/invoices"><Button><CreditCard className="mr-1.5 h-4 w-4" />View invoices</Button></Link>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-4">
        <QuickCard href="/invoices" label="My invoices" sub="Pay & track receipts" icon={Receipt} color="meadow" />
        <QuickCard href="/passes" label="Gate passes" sub={`${stats.openPasses} active`} icon={KeyRound} color="ember" />
        <QuickCard href="/requests" label="Submit a request" sub="Maintenance, access" icon={FileText} color="ocean" />
        {stats.openViolations > 0 ? (
          <QuickCard href="/violations" label="Open violations" sub={`${stats.openViolations} need attention`} icon={ShieldAlert} color="coral" />
        ) : (
          <QuickCard href="/notices" label="Notices" sub="Community updates" icon={Bell} color="ocean" />
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3">Upcoming invoices</h3>
          {loading ? (
            <Skeleton className="h-20" />
          ) : invoices.length === 0 ? (
            <CardWarm className="p-6 text-center">
              <p className="text-caption text-muted-foreground">All caught up — no invoices due.</p>
            </CardWarm>
          ) : (
            <ul className="divide-y divide-stone-surface">
              {invoices.map((i: any) => (
                <li key={i.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/invoices/${i.id}`} className="text-sm font-medium text-charcoal-primary hover:text-ember-orange">
                      {i.invoiceNumber}
                    </Link>
                    <p className="text-caption text-muted-foreground">Due {formatDate(i.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm tabular-nums text-graphite">{formatCurrency(i.amount)}</p>
                    <Badge variant={residentInvoiceStatus(i.status).variant}>{residentInvoiceStatus(i.status).label}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3">Notices</h3>
          {loading ? (
            <Skeleton className="h-20" />
          ) : notices.length === 0 ? (
            <CardWarm className="p-6 text-center">
              <p className="text-caption text-muted-foreground">No notices yet.</p>
            </CardWarm>
          ) : (
            <ul className="divide-y divide-stone-surface">
              {notices.map((n: any) => (
                <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href={`/notices/${n.id}`} className="text-sm font-medium text-charcoal-primary hover:text-ember-orange truncate block">
                    {n.subject}
                  </Link>
                  <p className="text-caption text-muted-foreground">{formatDate(n.sentAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </section>
    </div>
  );
}

function QuickCard({ href, label, sub, icon: Icon, color }: { href: string; label: string; sub: string; icon: any; color: 'meadow' | 'ember' | 'ocean' | 'coral' }) {
  const colorClass = {
    meadow: 'bg-meadow-green/15 text-meadow-green',
    ember: 'bg-ember-orange/15 text-ember-orange',
    ocean: 'bg-sky-blue/15 text-ocean-blue',
    coral: 'bg-coral-red/15 text-coral-red',
  }[color];
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-shadow duration-200 hover:shadow-soft"><CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colorClass}`}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ember-orange" />
        </div>
        <p className="mt-4 text-heading-sm font-medium text-charcoal-primary">{label}</p>
        <p className="mt-1 text-caption text-muted-foreground">{sub}</p>
      </CardContent></Card>
    </Link>
  );
}
