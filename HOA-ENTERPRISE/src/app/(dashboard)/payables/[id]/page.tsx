'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, CheckCircle2, XCircle, Banknote, Clock, FileText, Paperclip } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

const statusBadge: Record<string, 'muted' | 'info' | 'success' | 'warning' | 'destructive'> = {
  captured: 'muted', pending_approval: 'warning', approved: 'info', paid: 'success', rejected: 'destructive', cancelled: 'muted',
};

export default function VendorInvoiceDetail() {
  const { id } = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const [inv, setInv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [paymentRef, setPaymentRef] = useState('');

  const load = () => {
    setLoading(true);
    api.get<any>(`/vendor-invoices/${id}`).then((r) => setInv(r.data)).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const approve = async () => {
    const ok = await confirm({
      title: 'Approve this invoice?',
      description: `${inv.currency} ${Number(inv.amount).toFixed(2)} to ${inv.vendor.name}.`,
      confirmText: 'Approve',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const idemp = `approve-${id}-${Date.now()}`;
      await api.post(`/vendor-invoices/${id}/approve`, {}, idemp);
      toast({ variant: 'success', title: 'Approval recorded' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Approve failed', description: err.message });
    } finally { setBusy(false); }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return toast({ variant: 'error', title: 'Reason required' });
    setBusy(true);
    try {
      await api.post(`/vendor-invoices/${id}/reject`, { reason: rejectReason.trim() });
      toast({ variant: 'success', title: 'Invoice rejected' });
      setShowReject(false); setRejectReason('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Reject failed', description: err.message });
    } finally { setBusy(false); }
  };

  const pay = async () => {
    if (!paymentRef.trim()) return toast({ variant: 'error', title: 'Payment reference required' });
    setBusy(true);
    try {
      const idemp = `pay-${id}-${Date.now()}`;
      await api.post(`/vendor-invoices/${id}/pay`, { paymentReference: paymentRef.trim() }, idemp);
      toast({ variant: 'success', title: 'Payment recorded' });
      setShowPay(false); setPaymentRef('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Pay failed', description: err.message });
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    const ok = await confirm({
      title: 'Cancel this invoice?',
      description: 'This marks the invoice as cancelled. The action is final.',
      confirmText: 'Cancel invoice',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/vendor-invoices/${id}/cancel`, { reason: 'Cancelled by admin' });
      toast({ variant: 'success', title: 'Invoice cancelled' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Cancel failed', description: err.message });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!inv) return <Card><CardContent className="p-10 text-center"><p>Not found.</p></CardContent></Card>;

  const canApprove = inv.status === 'pending_approval';
  const canPay = inv.status === 'approved';
  const canCancel = ['captured', 'pending_approval', 'approved', 'rejected'].includes(inv.status);
  const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems : [];
  const attachments = Array.isArray(inv.attachments) ? inv.attachments : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/payables" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Payables
      </Link>

      <header>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusBadge[inv.status] || 'muted'}>{inv.status.replace('_', ' ')}</Badge>
          {inv.duplicateOf && <Badge variant="warning">duplicate of {inv.duplicateOf.vendorInvoiceNo}</Badge>}
        </div>
        <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">{inv.vendor.name}</h1>
        <p className="text-body text-muted-foreground mt-1">{inv.vendorInvoiceNo} · Issued {formatDate(inv.issueDate)} · Due {formatDate(inv.dueDate)}</p>
      </header>

      <Card><CardContent className="space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-3 text-sm">
          <Stat label="Amount" value={`${inv.currency} ${Number(inv.amount).toFixed(2)}`} big />
          {inv.vatAmount && <Stat label="VAT" value={`${inv.currency} ${Number(inv.vatAmount).toFixed(2)}`} />}
          {inv.glAccount && <Stat label="GL" value={`${inv.glAccount.code} · ${inv.glAccount.name}`} />}
        </div>

        {lineItems.length > 0 && (
          <div className="rounded-lg bg-stone-surface/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-caption text-muted-foreground">
                <tr><th className="px-4 py-2">Description</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Unit</th><th className="px-4 py-2 text-right">Total</th></tr>
              </thead>
              <tbody>
                {lineItems.map((l: any, i: number) => (
                  <tr key={i} className="border-t border-stone-surface">
                    <td className="px-4 py-2 text-graphite">{l.description}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{l.quantity}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{Number(l.unitPrice).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-graphite">{Number(l.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {inv.notes && <div><p className="text-caption text-muted-foreground mb-1">Notes</p><p className="text-sm text-graphite whitespace-pre-wrap">{inv.notes}</p></div>}

        {attachments.length > 0 && (
          <div>
            <p className="text-caption text-muted-foreground mb-2 flex items-center gap-1"><Paperclip className="h-3 w-3" /> Attachments ({attachments.length})</p>
            <div className="space-y-1.5">
              {attachments.map((a: any, i: number) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg p-2 bg-stone-surface/50 hover:bg-stone-surface text-sm text-graphite">
                  <FileText className="h-3.5 w-3.5" /> {a.filename}
                  <span className="ml-auto text-caption text-muted-foreground">{Math.round((a.size || 0) / 1024)} KB</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {inv.rejectedReason && (
          <div className="rounded-lg p-3 bg-coral-red/5 border border-coral-red/20">
            <p className="text-caption text-coral-red font-medium">Rejected</p>
            <p className="text-sm text-graphite mt-1">{inv.rejectedReason}</p>
          </div>
        )}

        {inv.paidAt && (
          <div className="rounded-lg p-3 bg-meadow-green/5 border border-meadow-green/20">
            <p className="text-caption text-meadow-green font-medium flex items-center gap-1"><Banknote className="h-3 w-3" />Paid {formatDate(inv.paidAt)}</p>
            <p className="text-sm text-graphite mt-1">Reference: {inv.paymentReference}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-surface">
          {canApprove && (
            <>
              <Button disabled={busy} onClick={approve}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve</Button>
              <Button variant="destructive" disabled={busy} onClick={() => setShowReject(true)}><XCircle className="mr-1.5 h-3.5 w-3.5" />Reject</Button>
            </>
          )}
          {canPay && <Button disabled={busy} onClick={() => setShowPay(true)}><Banknote className="mr-1.5 h-3.5 w-3.5" />Record payment</Button>}
          {canCancel && <Button variant="secondary" disabled={busy} onClick={cancel}>Cancel invoice</Button>}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-6">
        <h3 className="text-heading-sm font-display font-medium text-charcoal-primary mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />Approval timeline</h3>
        {(inv.approvals || []).length === 0 ? (
          <p className="text-caption text-muted-foreground">No approval rule matched. Configure approval rules to route invoices.</p>
        ) : (
          <div className="space-y-2">
            {inv.approvals.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg p-3 bg-stone-surface/50">
                <div>
                  <p className="text-sm text-graphite"><span className="font-medium">{a.requiredRole}</span> {a.decision === 'pending' ? 'awaiting decision' : `decided ${formatDate(a.decidedAt)}`}</p>
                  {a.notes && <p className="text-caption text-muted-foreground mt-0.5">{a.notes}</p>}
                </div>
                <Badge variant={a.decision === 'approved' ? 'success' : a.decision === 'rejected' ? 'destructive' : 'muted'}>{a.decision}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>

      <Drawer open={showReject} onOpenChange={setShowReject}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>Reject invoice</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reason <span className="text-coral-red">*</span></Label>
              <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required
                className="flex w-full rounded-lg bg-card px-3 py-2.5 text-sm shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="destructive" disabled={busy || !rejectReason.trim()} onClick={reject}>Reject</Button>
            <Button variant="secondary" onClick={() => setShowReject(false)}>Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={showPay} onOpenChange={setShowPay}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>Record payment</DrawerTitle>
            <DrawerDescription>
              Bank reference, cheque number, or other payment identifier.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Payment reference <span className="text-coral-red">*</span></Label>
              <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="EFT-2026-001" required />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button disabled={busy || !paymentRef.trim()} onClick={pay}>Mark as paid</Button>
            <Button variant="secondary" onClick={() => setShowPay(false)}>Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className={big ? 'text-heading-sm font-display tabular-nums text-charcoal-primary' : 'text-graphite tabular-nums'}>{value}</p>
    </div>
  );
}
