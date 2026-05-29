'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Send, Ban, Link as LinkIcon, Copy, FileText, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

const statusBadge: Record<string, 'muted' | 'info' | 'success' | 'destructive' | 'warning'> = {
  draft: 'muted', issued: 'success', superseded: 'warning', cancelled: 'destructive',
};

export default function ResaleDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const [r, setR] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkDays, setLinkDays] = useState(14);

  const load = () => {
    setLoading(true);
    api.get<any>(`/resale/${id}`).then((res) => setR(res.data)).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const refresh = async () => {
    setBusy(true);
    try {
      await api.post(`/resale/${id}/refresh-snapshot`, {});
      toast({ variant: 'success', title: 'Snapshot refreshed' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Refresh failed', description: err.message });
    } finally { setBusy(false); }
  };

  const issue = async () => {
    const ok = await confirm({
      title: 'Issue certificate?',
      description: r.goodStanding
        ? 'The financial snapshot will be frozen and the certificate becomes shareable with attorneys.'
        : 'WARNING: This unit has outstanding levies. Issuing will record arrears in the snapshot.',
      confirmText: 'Issue',
      destructive: !r.goodStanding,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/resale/${id}/issue`, {});
      toast({ variant: 'success', title: 'Certificate issued' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Issue failed', description: err.message });
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    const ok = await confirm({
      title: 'Cancel certificate?',
      description: 'This invalidates the certificate and revokes all access links.',
      confirmText: 'Cancel certificate',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/resale/${id}/cancel`, { reason: 'Cancelled by admin' });
      toast({ variant: 'success', title: 'Certificate cancelled' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Cancel failed', description: err.message });
    } finally { setBusy(false); }
  };

  const createLink = async () => {
    if (!linkLabel.trim()) return toast({ variant: 'error', title: 'Recipient label required' });
    setBusy(true);
    try {
      await api.post(`/resale/${id}/access-links`, { recipientLabel: linkLabel.trim(), expiryDays: linkDays });
      toast({ variant: 'success', title: 'Access link created' });
      setShowLink(false); setLinkLabel('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Create failed', description: err.message });
    } finally { setBusy(false); }
  };

  const revokeLink = async (linkId: string) => {
    const ok = await confirm({ title: 'Revoke link?', description: 'The recipient will lose access immediately.', confirmText: 'Revoke', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/resale/access-links/${linkId}`);
      toast({ variant: 'success', title: 'Link revoked' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Revoke failed', description: err.message });
    }
  };

  const copyUrl = (token: string) => {
    const base = process.env.NEXT_PUBLIC_RESIDENT_URL || 'http://localhost:3005';
    const url = `${base}/r/${token}`;
    navigator.clipboard.writeText(url);
    toast({ variant: 'success', title: 'Link copied' });
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!r) return <Card><CardContent className="p-10 text-center"><p>Not found.</p></CardContent></Card>;

  const snap = r.financialStatusJson as any;
  const checklist = Array.isArray(r.disclosureChecklist) ? r.disclosureChecklist : [];
  const attachments = Array.isArray(r.attachments) ? r.attachments : [];
  const isDraft = r.status === 'draft';
  const isIssued = r.status === 'issued';

  return (
    <div className="space-y-6">
      <Link href="/resale" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Resale
      </Link>

      <header>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusBadge[r.status] || 'muted'}>{r.status}</Badge>
          {r.goodStanding ? <Badge variant="success">good standing</Badge> : <Badge variant="warning">arrears: {r.transferLevyCurrency} {Number(r.outstandingAtSnapshot).toFixed(2)}</Badge>}
          {r.rushProcessing && <Badge variant="accent">rush</Badge>}
        </div>
        <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary font-mono">{r.certificateNumber}</h1>
        <p className="mt-1 text-body text-muted-foreground">{r.unit?.estate?.name} · Unit {r.unit?.unitNumber} · Created {formatDate(r.createdAt)}</p>
      </header>

      <Card><CardContent className="space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-3 text-sm">
          <Info label="Transfer levy" value={`${r.transferLevyCurrency} ${Number(r.transferLevyAmount).toFixed(2)}`} />
          <Info label="Admin fee" value={`${r.transferLevyCurrency} ${Number(r.feeAmount).toFixed(2)}`} />
          {r.slaDueAt && <Info label="SLA due" value={formatDate(r.slaDueAt)} />}
        </div>

        {(r.buyer || r.seller || r.transferAttorney) && (
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            {r.buyer && <Info label="Buyer" value={r.buyer.fullName} sub={r.buyer.email} />}
            {r.seller && <Info label="Seller" value={r.seller.fullName} sub={r.seller.email} />}
            {r.transferAttorney && <Info label="Attorney" value={r.transferAttorney.firmName} sub={r.transferAttorney.contactName || r.transferAttorney.email} />}
          </div>
        )}

        {isDraft && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-surface">
            <Button variant="secondary" disabled={busy} onClick={refresh}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh snapshot</Button>
            <Button disabled={busy} onClick={issue}><Send className="mr-1.5 h-3.5 w-3.5" />Issue</Button>
            <Button variant="destructive" disabled={busy} onClick={cancel}><Ban className="mr-1.5 h-3.5 w-3.5" />Cancel</Button>
          </div>
        )}
        {isIssued && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-surface">
            <Button variant="destructive" disabled={busy} onClick={cancel}><Ban className="mr-1.5 h-3.5 w-3.5" />Cancel</Button>
          </div>
        )}
      </CardContent></Card>

      {snap && (
        <Card><CardContent className="p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3">Financial snapshot</h3>
          <div className="grid gap-3 md:grid-cols-3 mb-4">
            <Info label="Total levied" value={`${snap.currency} ${Number(snap.totalLevied).toFixed(2)}`} />
            <Info label="Total paid" value={`${snap.currency} ${Number(snap.totalPaid).toFixed(2)}`} />
            <Info label="Balance" value={`${snap.currency} ${Number(snap.balance).toFixed(2)}`} highlight={snap.balance > 0.01} />
          </div>
          <p className="text-caption text-muted-foreground mb-2">As of {formatDate(snap.asOf)}</p>

          {snap.invoices?.length > 0 && (
            <div className="rounded-lg bg-stone-surface/50 overflow-hidden">
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
                      <td className="px-3 py-1.5"><Badge variant={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'destructive' : 'muted'}>{i.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent></Card>
      )}

      {checklist.length > 0 && (
        <Card><CardContent className="p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3">Disclosure checklist</h3>
          <div className="space-y-2">
            {checklist.map((c: any, i: number) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-stone-surface/50 p-3">
                <span className={c.present ? 'text-meadow-green' : 'text-muted-foreground'}>{c.present ? '✓' : '○'}</span>
                <div className="flex-1">
                  <p className="text-sm text-graphite">{c.label}</p>
                  {c.notes && <p className="text-caption text-muted-foreground mt-0.5">{c.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {attachments.length > 0 && (
        <Card><CardContent className="p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3">Attachments</h3>
          <div className="space-y-1.5">
            {attachments.map((a: any, i: number) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg p-2 bg-stone-surface/50 hover:bg-stone-surface text-sm text-graphite">
                <FileText className="h-3.5 w-3.5" /> {a.filename}
                {a.label && <span className="text-caption text-muted-foreground">· {a.label}</span>}
              </a>
            ))}
          </div>
        </CardContent></Card>
      )}

      {isIssued && (
        <Card><CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Attorney access links</h3>
            <Button size="sm" onClick={() => setShowLink(true)}><LinkIcon className="mr-1.5 h-3.5 w-3.5" />New link</Button>
          </div>
          {(r.accessLinks || []).length === 0 ? (
            <p className="text-caption text-muted-foreground">No links yet. Create one to share with attorneys.</p>
          ) : (
            <div className="space-y-2">
              {r.accessLinks.map((l: any) => {
                const expired = new Date(l.expiresAt) < new Date();
                const revoked = !!l.revokedAt;
                return (
                  <div key={l.id} className="rounded-lg bg-stone-surface/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-graphite font-medium truncate">{l.recipientLabel}</p>
                        <p className="text-caption text-muted-foreground">
                          {revoked ? 'Revoked' : expired ? 'Expired' : `Expires ${formatDate(l.expiresAt)}`}
                          {' · '}{l.accessCount} view{l.accessCount !== 1 ? 's' : ''}
                          {l.lastAccessedAt && ` · last ${formatDate(l.lastAccessedAt)}`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {!revoked && !expired && (
                          <button onClick={() => copyUrl(l.token)} className="text-muted-foreground hover:text-graphite p-1" title="Copy URL"><Copy className="h-4 w-4" /></button>
                        )}
                        {!revoked && (
                          <button onClick={() => revokeLink(l.id)} className="text-coral-red/70 hover:text-coral-red p-1" title="Revoke"><X className="h-4 w-4" /></button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent></Card>
      )}

      <Drawer open={showLink} onOpenChange={setShowLink}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>New access link</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Recipient label <span className="text-coral-red">*</span></Label>
              <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Smith & Co Attorneys" required />
              <p className="text-caption text-muted-foreground">Helps identify who has access in the audit trail.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Expires in (days)</Label>
              <Input type="number" min={1} max={60} value={linkDays} onChange={(e) => setLinkDays(Number(e.target.value))} />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button disabled={busy || !linkLabel.trim()} onClick={createLink}>Create link</Button>
            <Button variant="secondary" onClick={() => setShowLink(false)}>Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function Info({ label, value, sub, highlight }: { label: string; value: any; sub?: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className={highlight ? 'text-coral-red font-medium tabular-nums' : 'text-graphite tabular-nums'}>{value || '—'}</p>
      {sub && <p className="text-caption text-muted-foreground">{sub}</p>}
    </div>
  );
}
