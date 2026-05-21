'use client';

/**
 * Unit detail page. Reachable from /admin/people/[id] (so an admin can see
 * unit info without first navigating into the estate) and from the estate
 * detail's unit rows.
 *
 * Shows:
 *   - Identity (number / block / floor / type / estate)
 *   - Active occupancies (owner + tenant), with links to each person
 *   - History
 *   - Recent invoices on this unit
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Home,
  Building2,
  MapPin,
  History,
  KeyRound,
  Users,
  Calendar,
  Receipt,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

const invoiceBadgeMap: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive'> = {
  draft: 'muted',
  sent: 'info',
  partial: 'warning',
  paid: 'success',
  overdue: 'destructive',
  cancelled: 'muted',
};

export default function UnitDetailPage() {
  const { unitId } = useParams();
  const [unit, setUnit] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!unitId) return;
    setLoading(true);
    api
      .get<any>(`/units/${unitId}`)
      .then((res) => setUnit(res.data))
      .catch(() => setUnit(null))
      .finally(() => setLoading(false));
  }, [unitId]);

  const { activeOwner, activeTenant, history } = useMemo(() => {
    const occs = (unit?.occupancies ?? []) as any[];
    return {
      activeOwner: occs.find((o) => o.isActive && o.role === 'owner') ?? null,
      activeTenant: occs.find((o) => o.isActive && o.role === 'tenant') ?? null,
      history: occs
        .filter((o) => !o.isActive)
        .sort(
          (a, b) =>
            new Date(b.endDate || b.startDate).getTime() -
            new Date(a.endDate || a.startDate).getTime(),
        ),
    };
  }, [unit]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!unit) {
    return (
      <EmptyState
        variant="card"
        icon={Home}
        title="Unit not found"
        description="This unit may have been removed, or you may not have access."
        action={{ label: 'Back', onClick: () => { window.history.back(); } }}
      />
    );
  }

  const status = activeTenant
    ? { label: 'Rented', tone: 'info' as const }
    : activeOwner
    ? { label: 'Owner-occupied', tone: 'success' as const }
    : { label: 'Vacant', tone: 'muted' as const };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/estates/${unit.estate?.id}`}
          className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          {unit.estate?.name ?? 'Estate'}
        </Link>
      </div>

      {/* Identity */}
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-icon bg-stone-surface">
          <Home className="h-6 w-6 text-graphite" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
              Unit {unit.unitNumber}
            </h1>
            <Badge variant={status.tone}>{status.label}</Badge>
            <Badge variant="muted" className="capitalize">{unit.type}</Badge>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-muted-foreground">
            {unit.block && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Block {unit.block}
              </span>
            )}
            {unit.floor != null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-caption uppercase tracking-wider">Floor</span>
                {unit.floor}
              </span>
            )}
            {unit.estate?.name && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {unit.estate.name}
                {unit.estate.address && <span className="text-muted-foreground/80">· {unit.estate.address}</span>}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Active occupants */}
      <section>
        <h2 className="mb-2 text-heading-sm font-display font-medium text-charcoal-primary">
          Active occupants
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <OccupantSlot
            slot="owner"
            occ={activeOwner}
            emptyHint="Link an owner from the estate view's occupancy drawer."
          />
          <OccupantSlot
            slot="tenant"
            occ={activeTenant}
            emptyHint="No tenant — the unit is owner-occupied or vacant."
          />
        </div>
      </section>

      {/* Recent invoices */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-heading-sm font-display font-medium text-charcoal-primary inline-flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
            Recent invoices
          </h2>
          {unit.invoices?.length > 0 && (
            <Link
              href={`/finance/invoices?unitId=${unit.id}`}
              className="text-caption font-medium text-ember-orange hover:underline"
            >
              View all
            </Link>
          )}
        </div>
        {(!unit.invoices || unit.invoices.length === 0) ? (
          <EmptyState
            variant="card"
            icon={Receipt}
            title="No invoices yet"
            description="When you bill this unit, the most recent 10 invoices will appear here."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-stone-surface">
                {unit.invoices.map((inv: any) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/finance/invoices/${inv.id}`}
                        className="font-medium text-graphite hover:text-ember-orange transition-colors"
                      >
                        {inv.invoiceNumber}
                      </Link>
                      <p className="text-caption text-muted-foreground">
                        Due {formatDate(inv.dueDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <span className="tabular-nums text-graphite">
                        {formatCurrency(Number(inv.amount), inv.currency)}
                      </span>
                      <Badge variant={invoiceBadgeMap[inv.status] || 'muted'}>{inv.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {/* History */}
      {history.length > 0 && (
        <section>
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-heading-sm font-display font-medium text-charcoal-primary">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            Occupancy history
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-stone-surface">
                {history.map((occ: any) => (
                  <li
                    key={occ.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="muted">{occ.role}</Badge>
                      <Link
                        href={`/admin/people/${occ.person.id}`}
                        className="text-graphite hover:text-ember-orange transition-colors truncate"
                      >
                        {occ.person.firstName} {occ.person.lastName}
                      </Link>
                    </div>
                    <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(occ.startDate)} – {occ.endDate ? formatDate(occ.endDate) : '—'}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

function OccupantSlot({
  slot,
  occ,
  emptyHint,
}: {
  slot: 'owner' | 'tenant';
  occ: any | null;
  emptyHint: string;
}) {
  const isOwner = slot === 'owner';
  const Icon = isOwner ? KeyRound : Users;
  const variant = isOwner ? 'success' : 'info';
  const label = isOwner ? 'Owner' : 'Tenant';

  if (!occ) {
    return (
      <Card className="opacity-80">
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <Badge variant={variant}>
              <Icon className="mr-1 h-3 w-3" />
              {label}
            </Badge>
            <span className="text-caption text-muted-foreground italic">none</span>
          </div>
          <p className="mt-2 text-caption text-muted-foreground">{emptyHint}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <Badge variant={variant}>
            <Icon className="mr-1 h-3 w-3" />
            {label}
          </Badge>
          {occ.isPrimaryContact && <Badge variant="muted">Primary contact</Badge>}
        </div>
        <Link
          href={`/admin/people/${occ.person.id}`}
          className="mt-2 inline-block text-heading-sm font-medium text-charcoal-primary hover:text-ember-orange transition-colors"
        >
          {occ.person.firstName} {occ.person.lastName}
        </Link>
        <div className="mt-1 space-y-0.5 text-caption text-muted-foreground">
          {occ.person.email && <p className="truncate">{occ.person.email}</p>}
          {occ.person.phone && <p>{occ.person.phone}</p>}
          <p className="inline-flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            Since {formatDate(occ.startDate)}
          </p>
        </div>
        <Link
          href={`/admin/people/${occ.person.id}`}
          className={cn(
            'mt-3 inline-flex items-center gap-1 text-caption font-medium text-ember-orange hover:underline',
          )}
        >
          View person
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
