'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText, CheckCircle2, AlertTriangle, Building, Scale } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardWarm } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function PublicResaleView() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    fetch(`${API_URL}/api/resale/public/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Certificate not available');
        }
        return res.json();
      })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-8 space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md p-4 sm:p-8 mt-12">
        <Card>
          <CardContent className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-coral-red/10">
              <AlertTriangle className="h-5 w-5 text-coral-red" />
            </div>
            <h1 className="mt-3 font-display text-heading-sm text-charcoal-primary">Certificate not available</h1>
            <p className="mt-1 text-caption text-muted-foreground">{error || 'Link not found, revoked, or expired.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const snap = data.financialStatus || {};
  const checklist = Array.isArray(data.disclosureChecklist) ? data.disclosureChecklist : [];
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8 space-y-6">
      <header className="flex items-start gap-4">
        {data.organization?.logoUrl ? (
          <img src={data.organization.logoUrl} alt={data.organization.name} className="h-12 w-12 rounded-icon" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-icon bg-midnight">
            <span className="font-display text-base font-medium text-white">{data.organization?.name?.[0] || 'H'}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-heading-md text-charcoal-primary truncate">{data.organization?.name}</h1>
          <p className="text-caption text-muted-foreground">Resale certificate · Shared with {data.recipientLabel}</p>
        </div>
        <Badge variant={data.status === 'issued' ? 'success' : 'muted'}>{data.status}</Badge>
      </header>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-caption text-muted-foreground">Certificate #</p>
              <p className="font-mono text-heading-sm text-charcoal-primary">{data.certificateNumber}</p>
              {data.issuedAt && <p className="text-caption text-muted-foreground mt-1">Issued {formatDate(data.issuedAt)}</p>}
            </div>
            {data.goodStanding ? (
              <Badge variant="success" className="text-base px-3 py-1.5">
                <CheckCircle2 className="mr-1.5 h-4 w-4" />Good standing
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-base px-3 py-1.5">
                <AlertTriangle className="mr-1.5 h-4 w-4" />Outstanding: {data.transferLevy?.currency} {Number(data.outstandingAtSnapshot ?? 0).toFixed(2)}
              </Badge>
            )}
          </div>

          <div className="rounded-lg bg-stone-surface/50 p-4 flex items-center gap-3">
            <Building className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-graphite font-medium">{data.estate?.name}</p>
              <p className="text-caption text-muted-foreground">Unit {data.unit?.unitNumber}{data.unit?.block ? ` · Block ${data.unit.block}` : ''}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <Field label="Transfer levy" value={`${data.transferLevy?.currency} ${Number(data.transferLevy?.amount).toFixed(2)}`} />
            <Field label="Admin fee" value={`${data.fee?.currency} ${Number(data.fee?.amount).toFixed(2)}`} />
            <Field label="Expires" value={formatDate(data.expiresAt)} />
          </div>
        </CardContent>
      </Card>

      {(data.buyer || data.seller || data.transferAttorney) && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary flex items-center gap-2">
              <Scale className="h-4 w-4 text-muted-foreground" />Parties
            </h3>
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              {data.buyer && <Party label="Buyer" name={data.buyer.fullName} email={data.buyer.email} phone={data.buyer.phone} />}
              {data.seller && <Party label="Seller" name={data.seller.fullName} email={data.seller.email} phone={data.seller.phone} />}
              {data.transferAttorney && <Party label="Transfer attorney" name={data.transferAttorney.firmName} email={data.transferAttorney.email} phone={data.transferAttorney.phone} sub={data.transferAttorney.fileReference} />}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Financial snapshot</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Total levied" value={`${snap.currency} ${Number(snap.totalLevied ?? 0).toFixed(2)}`} />
            <Field label="Total paid" value={`${snap.currency} ${Number(snap.totalPaid ?? 0).toFixed(2)}`} />
            <Field label="Balance" value={`${snap.currency} ${Number(snap.balance ?? 0).toFixed(2)}`} highlight={Number(snap.balance ?? 0) > 0.01} />
          </div>
          {snap.asOf && <p className="text-caption text-muted-foreground">Snapshot taken {formatDate(snap.asOf)}</p>}

          {snap.invoices?.length > 0 && (
            <div className="rounded-lg bg-stone-surface/50 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-caption text-muted-foreground">
                  <tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th></tr>
                </thead>
                <tbody>
                  {snap.invoices.map((i: any) => (
                    <tr key={i.id} className="border-t border-stone-surface">
                      <td className="px-3 py-1.5 text-graphite">{i.reference}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{formatDate(i.dueDate)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-graphite">{Number(i.amount).toFixed(2)}</td>
                      <td className="px-3 py-1.5"><Badge variant={i.status === 'paid' ? 'success' : 'muted'}>{i.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {checklist.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Disclosure checklist</h3>
            <div className="space-y-2">
              {checklist.map((c: any, i: number) => (
                <div key={i} className="flex items-start gap-3 rounded-lg bg-stone-surface/50 p-3">
                  <span className={c.present ? 'text-meadow-green text-lg' : 'text-muted-foreground text-lg'}>{c.present ? '✓' : '○'}</span>
                  <div className="flex-1">
                    <p className="text-sm text-graphite">{c.label}</p>
                    {c.notes && <p className="text-caption text-muted-foreground mt-0.5">{c.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {attachments.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Documents</h3>
            <div className="space-y-1.5">
              {attachments.map((a: any, i: number) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg p-3 bg-stone-surface/50 hover:bg-stone-surface text-sm text-graphite">
                  <FileText className="h-4 w-4" /> {a.filename}
                  {a.label && <span className="text-caption text-muted-foreground">· {a.label}</span>}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <CardWarm className="p-4 text-caption text-graphite">
        <p>This certificate was shared with you by {data.organization?.name}. Access is logged for audit purposes. If you have questions, contact the HOA directly.</p>
      </CardWarm>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className={highlight ? 'text-coral-red font-medium tabular-nums' : 'text-graphite tabular-nums'}>{value}</p>
    </div>
  );
}

function Party({ label, name, email, phone, sub }: { label: string; name: string; email?: string; phone?: string; sub?: string }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-graphite font-medium">{name}</p>
      {email && <p className="text-caption text-muted-foreground">{email}</p>}
      {phone && <p className="text-caption text-muted-foreground">{phone}</p>}
      {sub && <p className="text-caption text-muted-foreground">Ref: {sub}</p>}
    </div>
  );
}
