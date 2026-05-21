'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, MessageCircle, Send, Copy, Ban, Car, User2, Calendar, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardWarm } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';

const statusBadgeMap: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary' | 'accent'> = {
  active: 'success',
  used: 'muted',
  revoked: 'destructive',
  expired: 'warning',
};

export default function PassDetailPage() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [pass, setPass] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchPass = () => {
    api
      .get<any>(`/passes/${id}`)
      .then((res) => setPass(res.data))
      .catch((err) =>
        toast({ variant: 'error', title: 'Could not load pass', description: err.message }),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPass();
  }, [id]);

  const formatted = pass ? `${pass.code.slice(0, 4)}-${pass.code.slice(4)}` : '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = pass ? `${origin}/v/${pass.code}` : '';

  const shareText = pass
    ? `Hi ${pass.visitorName}, here is your gate pass to ${pass.unit?.estate?.name || 'the estate'}: ${publicUrl}`
    : '';
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const smsUrl = `sms:?body=${encodeURIComponent(shareText)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast({ variant: 'success', title: 'Link copied' });
    } catch {
      toast({ variant: 'error', title: 'Could not copy', description: 'Use the WhatsApp or SMS button instead.' });
    }
  };

  const handleRevoke = async () => {
    const ok = await confirm({
      title: `Revoke pass for ${pass?.visitorName}?`,
      description: 'The QR will stop working immediately. This cannot be undone.',
      confirmText: 'Revoke pass',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.post(`/passes/${id}/revoke`);
      toast({ variant: 'success', title: 'Pass revoked' });
      fetchPass();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Revoke failed', description: err.message });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!pass) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-body text-muted-foreground">Pass not found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/passes"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        Gate passes
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-caption text-muted-foreground">{formatted}</p>
          <h1 className="mt-1 font-display text-heading-lg leading-tight text-charcoal-primary">
            {pass.visitorName}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={statusBadgeMap[pass.status] || 'secondary'}>{pass.status}</Badge>
            {!pass.validity?.valid && (
              <span className="text-caption text-coral-red">
                {pass.validity?.reason?.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>
        {pass.status === 'active' && (
          <Button variant="secondary" onClick={handleRevoke}>
            <Ban className="mr-1.5 h-4 w-4" />
            Revoke
          </Button>
        )}
      </header>

      {/* QR & share */}
      <Card>
        <CardContent className="p-6">
          <CardWarm className="mb-6 p-6">
            <div className="flex justify-center">
              <div
                className="rounded-lg bg-card p-3 shadow-inset-stone"
                dangerouslySetInnerHTML={{ __html: pass.qrSvg }}
              />
            </div>
            <p className="mt-4 text-center text-caption text-muted-foreground">
              Show this QR at the gate, or share the link below with your visitor.
            </p>
          </CardWarm>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button asChild>
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" />
                WhatsApp
              </a>
            </Button>
            <Button variant="secondary" asChild>
              <a href={smsUrl}>
                <Send className="mr-1.5 h-4 w-4" />
                SMS
              </a>
            </Button>
            <Button variant="secondary" onClick={copyLink}>
              <Copy className="mr-1.5 h-4 w-4" />
              Copy link
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Details</h3>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="flex items-start gap-2">
              <User2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-caption uppercase tracking-wider text-muted-foreground">Type</p>
                <p className="text-graphite capitalize">{pass.type.replace('_', ' ')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-caption uppercase tracking-wider text-muted-foreground">Validity</p>
                <p className="text-graphite">
                  {formatDate(pass.validFrom)} → {formatDate(pass.validUntil)}
                </p>
              </div>
            </div>
            {pass.vehicleReg && (
              <div className="flex items-start gap-2">
                <Car className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-caption uppercase tracking-wider text-muted-foreground">Vehicle</p>
                  <p className="text-graphite font-mono">{pass.vehicleReg}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-caption uppercase tracking-wider text-muted-foreground">Uses</p>
                <p className="text-graphite">
                  {pass.usesCount} / {pass.maxUses}
                </p>
              </div>
            </div>
          </div>
          {pass.notes && (
            <div className="border-t border-stone-surface pt-3">
              <p className="text-caption uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="mt-1 text-body text-graphite">{pass.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visitor logs */}
      {pass.logs && pass.logs.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Activity</h3>
            <ul className="mt-3 divide-y divide-stone-surface">
              {pass.logs.map((log: any) => (
                <li key={log.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-charcoal-primary capitalize">
                      {log.type.replace('_', ' ')}
                    </p>
                    <p className="text-caption text-muted-foreground">{formatDate(log.occurredAt)}</p>
                  </div>
                  {log.overrideReason && (
                    <Badge variant="warning">Override</Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
