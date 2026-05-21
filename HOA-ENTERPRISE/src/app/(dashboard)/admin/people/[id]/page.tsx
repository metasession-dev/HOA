'use client';

/**
 * Person detail page — shows who someone is + where they actually live in
 * your portfolio. Closes the gap between the global Person.type label and
 * the per-unit occupancy role, which were confusing on their own:
 *
 *   Person.type           — global classification (owner / tenant / stakeholder)
 *   UnitOccupancy.role    — per-unit role on a specific unit (owner / tenant)
 *
 * The two don't always match. An owner can rent OUT one unit (role=owner on
 * unit A) while renting somewhere else (role=tenant on unit B). This page
 * lays both out side-by-side so the manager can see the full picture.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Mail,
  Phone,
  MapPin,
  History,
  ArrowRight,
  KeyRound,
  Users,
  Calendar,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, getInitials, cn } from '@/lib/utils';

function personTypeLabel(t?: string): string {
  switch (t) {
    case 'tenant': return 'Tenant';
    case 'stakeholder': return 'Stakeholder';
    case 'owner':
    default: return 'Owner';
  }
}
function personTypeVariant(t?: string): 'success' | 'info' | 'muted' {
  switch (t) {
    case 'tenant': return 'info';
    case 'stakeholder': return 'muted';
    case 'owner':
    default: return 'success';
  }
}

export default function PersonDetailPage() {
  const { id } = useParams();
  const [person, setPerson] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<any>(`/people/${id}`)
      .then((res) => setPerson(res.data))
      .catch(() => setPerson(null))
      .finally(() => setLoading(false));
  }, [id]);

  const { active, historical } = useMemo(() => {
    const occs = (person?.occupancies ?? []) as any[];
    return {
      active: occs.filter((o) => o.isActive),
      historical: occs
        .filter((o) => !o.isActive)
        .sort(
          (a, b) =>
            new Date(b.endDate || b.startDate).getTime() -
            new Date(a.endDate || a.startDate).getTime(),
        ),
    };
  }, [person]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!person) {
    return (
      <EmptyState
        variant="card"
        icon={Users}
        title="Person not found"
        description="This person may have been removed, or you may not have access. Head back to the people list."
        action={{ label: 'All people', onClick: () => { window.history.back(); } }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/people"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        All people
      </Link>

      {/* Header — identity + contact + global type. */}
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-stone-surface text-heading-sm font-medium text-graphite">
          {getInitials(person.firstName, person.lastName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
              {person.firstName} {person.lastName}
            </h1>
            <Badge variant={personTypeVariant(person.type)}>{personTypeLabel(person.type)}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-body text-muted-foreground">
            {person.email && (
              <a
                href={`mailto:${person.email}`}
                className="inline-flex items-center gap-1.5 hover:text-graphite transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                {person.email}
              </a>
            )}
            {person.phone && (
              <a
                href={`tel:${person.phone}`}
                className="inline-flex items-center gap-1.5 hover:text-graphite transition-colors"
              >
                <Phone className="h-3.5 w-3.5" />
                {person.phone}
              </a>
            )}
            {!person.email && !person.phone && (
              <span className="text-muted-foreground/60 italic">No contact info on file</span>
            )}
          </div>
        </div>
      </header>

      {/* Active occupancies — where this person currently has a stake. The
          per-unit role can differ from the global Person.type. */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-heading-sm font-display font-medium text-charcoal-primary">
            Active occupancies
          </h2>
          <p className="text-caption text-muted-foreground">
            {active.length} {active.length === 1 ? 'unit' : 'units'}
          </p>
        </div>
        {active.length === 0 ? (
          <EmptyState
            variant="card"
            icon={MapPin}
            title="Not linked to any unit"
            description={
              person.type === 'stakeholder'
                ? 'Stakeholders typically aren\'t tied to a specific unit — they manage the HOA at the org level.'
                : 'Link this person to a unit from the estate view so billing, gate passes and notices reach them.'
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((occ) => (
              <OccupancyCard key={occ.id} occ={occ} active />
            ))}
          </div>
        )}
      </section>

      {/* Past occupancies — historical record, useful for resale + audit. */}
      {historical.length > 0 && (
        <section>
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-heading-sm font-display font-medium text-charcoal-primary">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            History
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-stone-surface">
                {historical.map((occ) => (
                  <li
                    key={occ.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="muted">{occ.role}</Badge>
                      <Link
                        href={`/admin/estates/${occ.unit?.estate?.id}`}
                        className="truncate text-graphite hover:text-ember-orange transition-colors"
                      >
                        {occ.unit?.estate?.name} · Unit {occ.unit?.unitNumber}
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

function OccupancyCard({ occ, active }: { occ: any; active: boolean }) {
  const unit = occ.unit;
  const estate = unit?.estate;
  const roleVariant = occ.role === 'owner' ? 'success' : 'info';

  // Surface the other people currently on this unit. The most informative
  // case: this person is the owner, and there's also a tenant — i.e. they're
  // renting their unit out. We want the owner to see who lives there, and a
  // tenant to see who their landlord is.
  const allOccs = (unit?.occupancies ?? []) as any[];
  const others = allOccs.filter((o: any) => o.id !== occ.id);
  const otherOwner = others.find((o: any) => o.role === 'owner');
  const otherTenant = others.find((o: any) => o.role === 'tenant');

  // Status line summarising whether the unit is rented or owner-occupied
  // from this person's perspective.
  let status: { label: string; tone: 'success' | 'info' | 'muted' };
  if (occ.role === 'owner') {
    status = otherTenant
      ? { label: 'Rented out', tone: 'info' }
      : { label: 'Owner-occupied', tone: 'success' };
  } else {
    status = { label: 'Renting', tone: 'info' };
  }

  return (
    <Card className={cn(!active && 'opacity-70')}>
      <CardContent className="p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={roleVariant}>
              {occ.role === 'owner' ? (
                <><KeyRound className="mr-1 h-3 w-3" />Owner</>
              ) : (
                <><Users className="mr-1 h-3 w-3" />Tenant</>
              )}
            </Badge>
            <Badge variant={status.tone}>{status.label}</Badge>
            {occ.isPrimaryContact && (
              <Badge variant="muted">Primary contact</Badge>
            )}
          </div>
          <p className="mt-2 text-heading-sm font-medium text-charcoal-primary">
            Unit {unit?.unitNumber}
            {unit?.block && <span className="text-muted-foreground"> · Block {unit.block}</span>}
          </p>
          {estate?.name && (
            <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {estate.name}
              {estate.address && <span className="truncate"> · {estate.address}</span>}
            </p>
          )}
          <p className="mt-2 inline-flex items-center gap-1.5 text-caption text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Since {formatDate(occ.startDate)}
            {occ.endDate && ` — ${formatDate(occ.endDate)}`}
          </p>

          {/* Counter-party — owner sees tenant, tenant sees owner. */}
          {(occ.role === 'owner' && otherTenant) && (
            <p className="mt-2 text-caption text-muted-foreground">
              Tenant:{' '}
              <Link
                href={`/admin/people/${otherTenant.person.id}`}
                className="font-medium text-graphite hover:text-ember-orange transition-colors"
              >
                {otherTenant.person.firstName} {otherTenant.person.lastName}
              </Link>
            </p>
          )}
          {(occ.role === 'tenant' && otherOwner) && (
            <p className="mt-2 text-caption text-muted-foreground">
              Landlord:{' '}
              <Link
                href={`/admin/people/${otherOwner.person.id}`}
                className="font-medium text-graphite hover:text-ember-orange transition-colors"
              >
                {otherOwner.person.firstName} {otherOwner.person.lastName}
              </Link>
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {unit?.id && (
            <Link
              href={`/admin/units/${unit.id}`}
              className="inline-flex items-center gap-1 text-caption font-medium text-ember-orange hover:underline"
            >
              View unit details
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {estate?.id && (
            <Link
              href={`/admin/estates/${estate.id}`}
              className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors"
            >
              Open in estate view
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
