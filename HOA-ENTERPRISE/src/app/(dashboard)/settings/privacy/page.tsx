'use client';

import { useEffect, useState } from 'react';
import { Download, Trash2, ShieldCheck, AlertTriangle, FileJson, X } from 'lucide-react';
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
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';

type ExportRow = {
  id: string;
  status: 'pending' | 'ready' | 'expired' | 'failed';
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
  fileSize: number | null;
  sha256: string | null;
  errorMessage: string | null;
};

type ErasureRow = {
  id: string;
  status: 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  reason: string | null;
  scheduledFor: string;
  completedAt: string | null;
  createdAt: string;
  rejectedReason: string | null;
};

const TYPES: Array<{ key: string; label: string; description: string }> = [
  { key: 'marketing_email', label: 'Marketing emails', description: 'Product updates and newsletters.' },
  { key: 'analytics_cookies', label: 'Analytics cookies', description: 'Anonymized usage telemetry to improve the product.' },
  { key: 'transactional_sms', label: 'Transactional SMS', description: 'Payment confirmations and security alerts.' },
];

export default function PrivacyPage() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [exports, setExports] = useState<ExportRow[]>([]);
  const [erasure, setErasure] = useState<ErasureRow[]>([]);
  const [consents, setConsents] = useState<Record<string, 'given' | 'withdrawn'>>({});

  const [reason, setReason] = useState('');
  const [showErasure, setShowErasure] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<any>('/privacy/exports').then((r) => setExports(r.data || [])).catch(() => setExports([])),
      api.get<any>('/privacy/erasure').then((r) => setErasure(r.data || [])).catch(() => setErasure([])),
      api.get<any>('/privacy/consent/current').then((r) => setConsents(r.data || {})).catch(() => setConsents({})),
    ]).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const requestExport = async () => {
    setBusy(true);
    try {
      const idemp = `export-${Date.now()}`;
      await api.post('/privacy/exports', {}, idemp);
      toast({ variant: 'success', title: 'Export requested', description: 'Your data is being prepared. Refresh in a moment.' });
      setTimeout(load, 1500);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const downloadExport = async (id: string) => {
    try {
      const r = await api.get<any>(`/privacy/exports/${id}/download`);
      const json = JSON.stringify(r.data.bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `hoa-data-export-${id}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Download failed', description: err.message });
    }
  };

  const submitErasure = async () => {
    setBusy(true);
    try {
      const idemp = `erasure-${Date.now()}`;
      await api.post('/privacy/erasure', { reason: reason || undefined }, idemp);
      toast({ variant: 'success', title: 'Request submitted', description: 'A 30-day waiting window applies. You can cancel at any time before then.' });
      setShowErasure(false); setReason('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const cancelErasure = async (id: string) => {
    const ok = await confirm({
      title: 'Cancel erasure request?',
      description: 'Your data will remain intact. You can submit a new request later.',
      confirmText: 'Cancel request',
    });
    if (!ok) return;
    try {
      await api.delete(`/privacy/erasure/${id}`);
      toast({ variant: 'success', title: 'Cancelled' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const toggleConsent = async (key: string, next: 'given' | 'withdrawn') => {
    try {
      await api.post('/privacy/consent', { consentType: key, state: next });
      setConsents((c) => ({ ...c, [key]: next }));
      toast({ variant: 'success', title: 'Saved' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const openErasure = erasure.find((e) => ['submitted', 'reviewing', 'approved'].includes(e.status));

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Privacy & your data</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Manage your consents, download a copy of your data, or request deletion under POPIA / GDPR.
        </p>
      </header>

      {/* CONSENTS */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-meadow-green" />
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Consents</h3>
          </div>
          <ul className="divide-y divide-stone-surface">
            {TYPES.map((t) => {
              const state = consents[t.key] || 'withdrawn';
              const given = state === 'given';
              return (
                <li key={t.key} className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-charcoal-primary">{t.label}</p>
                    <p className="text-caption text-muted-foreground">{t.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={given ? 'destructive' : 'default'}
                    onClick={() => toggleConsent(t.key, given ? 'withdrawn' : 'given')}
                  >
                    {given ? 'Withdraw' : 'Give consent'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* DATA EXPORT */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-deep-amber" />
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Data export</h3>
            </div>
            <Button onClick={requestExport} disabled={busy}>
              <Download className="mr-1.5 h-4 w-4" /> Request export
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            We package every record we hold about you (profile, billing, communications, audit history) into a JSON file.
            Links expire 30 days after the export is ready.
          </p>
          {exports.length > 0 ? (
            <ul className="divide-y divide-stone-surface">
              {exports.map((e) => (
                <li key={e.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={e.status === 'ready' ? 'success' : e.status === 'failed' ? 'destructive' : 'muted'}>{e.status}</Badge>
                      <span className="text-caption text-muted-foreground">Requested {formatDate(e.createdAt)}</span>
                    </div>
                    {e.completedAt && <p className="text-caption text-muted-foreground mt-0.5">Ready {formatDate(e.completedAt)}</p>}
                    {e.errorMessage && <p className="text-caption text-coral-red mt-0.5">{e.errorMessage}</p>}
                  </div>
                  {e.status === 'ready' && (
                    <Button size="sm" variant="secondary" onClick={() => downloadExport(e.id)}>
                      <Download className="mr-1 h-3.5 w-3.5" /> Download
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-muted-foreground">No exports yet.</p>
          )}
        </CardContent>
      </Card>

      {/* ERASURE */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-coral-red" />
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Right to be forgotten</h3>
          </div>
          <p className="text-caption text-muted-foreground">
            Submitting an erasure request begins a 30-day waiting window. Once executed, your personally identifying fields
            (name, email, phone) are replaced with redactions across this estate's records.
            Audit log entries are retained for legal compliance but with identifiers removed.
          </p>

          {openErasure ? (
            <div className="rounded-lg border border-deep-amber/40 bg-deep-amber/10 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-deep-amber" />
                <p className="font-medium text-charcoal-primary capitalize">{openErasure.status} request</p>
              </div>
              <p className="text-caption text-muted-foreground mt-1">
                Scheduled execution {formatDate(openErasure.scheduledFor)} · submitted {formatDate(openErasure.createdAt)}
              </p>
              {openErasure.reason && <p className="text-caption text-graphite mt-1">"{openErasure.reason}"</p>}
              <Button size="sm" variant="ghost" onClick={() => cancelErasure(openErasure.id)} className="mt-2">
                <X className="mr-1 h-3.5 w-3.5" /> Cancel this request
              </Button>
            </div>
          ) : (
            <Button variant="destructive" onClick={() => setShowErasure(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Request erasure
            </Button>
          )}

          {erasure.filter((e) => !['submitted', 'reviewing', 'approved'].includes(e.status)).length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-caption text-muted-foreground">Past requests ({erasure.filter((e) => !['submitted', 'reviewing', 'approved'].includes(e.status)).length})</summary>
              <ul className="divide-y divide-stone-surface mt-2">
                {erasure.filter((e) => !['submitted', 'reviewing', 'approved'].includes(e.status)).map((e) => (
                  <li key={e.id} className="py-2">
                    <Badge variant="muted">{e.status}</Badge>
                    <span className="ml-2 text-caption text-muted-foreground">{formatDate(e.createdAt)}</span>
                    {e.rejectedReason && <p className="text-caption text-coral-red mt-1">{e.rejectedReason}</p>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Erasure drawer */}
      <Drawer open={showErasure} onOpenChange={setShowErasure}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>Confirm erasure request</DrawerTitle>
            <DrawerDescription>
              A 30-day waiting period gives you time to change your mind. After that, an admin executes the erasure and your
              personal identifiers are redacted across this organization&apos;s data.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. closing my account" />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="destructive" onClick={submitErasure} disabled={busy}>Submit request</Button>
            <Button variant="secondary" onClick={() => setShowErasure(false)}>Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
