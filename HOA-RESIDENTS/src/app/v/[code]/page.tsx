'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ShieldCheck, Calendar, Car, Building2, ShieldAlert } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardWarm } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const reasonLabel: Record<string, string> = {
  revoked: 'Revoked',
  already_used: 'Already used',
  max_uses_reached: 'No entries remaining',
  not_yet_valid: 'Not active yet',
  expired: 'Expired',
  not_active_today: 'Not active today',
  outside_window: 'Outside allowed hours',
};

export default function PublicVisitorView() {
  const params = useParams<{ code: string }>();
  const code = params?.code as string;
  const [pass, setPass] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    fetch(`${API_URL}/api/passes/public/${code}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Pass not found');
        }
        return res.json();
      })
      .then((res) => setPass(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [code]);

  const formatted = code ? `${code.slice(0, 4)}-${code.slice(4)}`.toUpperCase() : '';

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <div className="mb-6 flex items-center justify-center gap-2">
        <img src="/icons/logo.png" alt="HOA.africa" className="h-9 w-9" />
        <span className="font-display text-heading-sm text-charcoal-primary">HOA.africa</span>
      </div>

      {loading ? (
        <Skeleton className="h-96" />
      ) : error ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-coral-red/15 text-coral-red">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <p className="mt-3 text-body text-charcoal-primary font-medium">Pass not found</p>
            <p className="text-caption text-muted-foreground">{error}</p>
            <p className="mt-3 font-mono text-caption text-muted-foreground">Code: {formatted}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-6">
              <p className="text-caption uppercase tracking-wider text-muted-foreground text-center">
                Gate pass
              </p>
              <h1 className="mt-1 text-center font-display text-heading-lg leading-tight text-charcoal-primary">
                {pass.visitorName}
              </h1>
              <p className="mt-1 text-center text-body text-muted-foreground">
                You have a pass to <span className="text-graphite font-medium">{pass.estate.name}</span>
              </p>

              <CardWarm className="my-6 p-6">
                <div className="flex justify-center">
                  <div
                    className="rounded-lg bg-card p-3 shadow-inset-stone"
                    dangerouslySetInnerHTML={{ __html: pass.qrSvg }}
                  />
                </div>
                <p className="mt-3 text-center font-mono text-heading-sm font-medium text-charcoal-primary">
                  {formatted}
                </p>
              </CardWarm>

              <div className="flex items-center justify-center gap-2">
                {pass.validity?.valid ? (
                  <Badge variant="success">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Valid
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    {reasonLabel[pass.validity?.reason] || pass.validity?.reason}
                  </Badge>
                )}
              </div>

              <div className="mt-5 space-y-2.5 text-sm">
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-caption uppercase tracking-wider text-muted-foreground">Valid</p>
                    <p className="text-graphite">
                      {formatDate(pass.validFrom)} → {formatDate(pass.validUntil)}
                    </p>
                  </div>
                </div>
                {pass.vehicleReg && (
                  <div className="flex items-start gap-2">
                    <Car className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-caption uppercase tracking-wider text-muted-foreground">Vehicle</p>
                      <p className="text-graphite font-mono">{pass.vehicleReg}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-caption uppercase tracking-wider text-muted-foreground">Unit</p>
                    <p className="text-graphite">
                      Unit {pass.unit.unitNumber}
                      {pass.unit.block ? ` · Block ${pass.unit.block}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <CardWarm className="mt-4 p-4 text-center">
            <p className="text-caption text-graphite">
              Show this screen at the gate. Security will scan the QR or enter the code{' '}
              <span className="font-mono font-medium text-charcoal-primary">{formatted}</span>.
            </p>
          </CardWarm>
        </>
      )}
    </div>
  );
}
