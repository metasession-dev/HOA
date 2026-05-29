'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Upload, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';

const SAMPLE = `email,firstName,lastName,roleName,approvalLimit
finance.officer@example.com,Sarah,Jones,finance_officer,5000
exco.member1@example.com,John,Brown,exco_member,
maintenance@example.com,Mark,Smith,maintenance_coordinator,`;

export default function BulkInvitePage() {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = csv.trim().split('\n').filter(Boolean);
    if (lines.length < 2) return toast({ variant: 'error', title: 'CSV is empty' });
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const required = ['email', 'rolename'];
    for (const h of required) {
      if (!headers.includes(h)) return toast({ variant: 'error', title: `Missing column: ${h}` });
    }
    const colIdx = (n: string) => headers.indexOf(n);
    const invites: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      const row: any = {
        email: parts[colIdx('email')]?.toLowerCase(),
        firstName: colIdx('firstname') >= 0 ? parts[colIdx('firstname')] || undefined : undefined,
        lastName: colIdx('lastname') >= 0 ? parts[colIdx('lastname')] || undefined : undefined,
        roleName: parts[colIdx('rolename')] || undefined,
      };
      const al = colIdx('approvallimit');
      if (al >= 0 && parts[al]) row.approvalLimit = Number(parts[al]);
      if (!row.email) continue;
      invites.push(row);
    }
    if (invites.length === 0) return toast({ variant: 'error', title: 'No valid rows found' });

    setBusy(true);
    try {
      const idemp = `bulk-${Date.now()}`;
      const r = await api.post<any>('/team/invites/bulk', { invites }, idemp);
      setResult(r.data);
      toast({ variant: 'success', title: 'Bulk import done', description: `${r.data.succeeded}/${r.data.total} created` });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/team/invites" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Invites
      </Link>
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Bulk invite</h1>
        <p className="mt-1 text-body text-muted-foreground">Paste CSV with columns: <code className="bg-stone-surface/50 px-1 rounded text-xs">email,firstName,lastName,roleName,approvalLimit</code>. Max 200 rows.</p>
      </header>

      <form onSubmit={submit}>
        <Card><CardContent className="space-y-4 p-6">
          <textarea rows={12} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE}
            className="flex w-full rounded-lg bg-card px-3 py-2.5 text-xs font-mono shadow-inset-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCsv(SAMPLE)}>Load sample</Button>
            <Button type="submit" disabled={busy}><Upload className="mr-1.5 h-4 w-4" />{busy ? 'Importing…' : 'Import'}</Button>
          </div>
        </CardContent></Card>
      </form>

      {result && (
        <Card><CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <p className="text-heading-sm font-display text-charcoal-primary">{result.succeeded} succeeded</p>
            {result.failed > 0 && <p className="text-heading-sm font-display text-coral-red">{result.failed} failed</p>}
            <Badge variant="muted" className="ml-auto">bulk-id {result.bulkImportId.slice(0, 8)}…</Badge>
          </div>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {result.results.map((r: any) => (
              <div key={r.row} className="flex items-center gap-2 text-sm">
                {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-meadow-green" /> : <XCircle className="h-3.5 w-3.5 text-coral-red" />}
                <span className="font-mono text-xs text-muted-foreground">#{r.row}</span>
                <span className="text-graphite truncate">{r.email}</span>
                {!r.ok && <span className="text-caption text-coral-red ml-auto">{r.error}</span>}
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
