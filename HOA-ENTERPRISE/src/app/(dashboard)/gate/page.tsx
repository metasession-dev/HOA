'use client';

import { useEffect, useState } from 'react';
import { ScanLine, Check, X, ShieldAlert, LogOut, Car, User2, Building2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardWarm } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

const reasonLabel: Record<string, string> = {
  revoked: 'Pass revoked',
  already_used: 'Already used',
  max_uses_reached: 'No entries remaining',
  not_yet_valid: 'Not active yet',
  expired: 'Expired',
  not_active_today: 'Not active today',
  outside_window: 'Outside allowed hours',
};

const logTypeColor: Record<string, string> = {
  entry: 'text-meadow-green',
  exit: 'text-graphite',
  override_entry: 'text-deep-amber',
  denied: 'text-coral-red',
};

function formatCode(input: string): string {
  const clean = input.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

export default function GateConsolePage() {
  const [codeInput, setCodeInput] = useState('');
  const [pass, setPass] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [todayLogs, setTodayLogs] = useState<any[]>([]);

  const refreshLogs = () => {
    api.get<any>('/visitor-logs/today').then((r) => setTodayLogs(r.data?.logs || [])).catch(() => null);
  };

  useEffect(() => {
    refreshLogs();
  }, []);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = codeInput.replace(/[^A-Za-z0-9]/g, '');
    if (code.length < 4) {
      toast({ variant: 'error', title: 'Enter a full pass code' });
      return;
    }
    setSearching(true);
    setPass(null);
    try {
      const res: any = await api.post('/passes/gate/verify', { code });
      setPass(res.data);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Pass not found', description: err.message });
    } finally {
      setSearching(false);
    }
  };

  const handleEntry = async (override?: string) => {
    if (!pass) return;
    setActionBusy(true);
    try {
      await api.post(`/passes/${pass.id}/entry`, override ? { overrideReason: override } : {});
      toast({ variant: 'success', title: override ? 'Override entry logged' : 'Entry allowed' });
      setOverrideOpen(false);
      setOverrideReason('');
      setPass(null);
      setCodeInput('');
      refreshLogs();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not log entry', description: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  const handleExit = async () => {
    if (!pass) return;
    setActionBusy(true);
    try {
      await api.post(`/passes/${pass.id}/exit`, {});
      toast({ variant: 'success', title: 'Exit logged' });
      setPass(null);
      setCodeInput('');
      refreshLogs();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not log exit', description: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeny = async () => {
    if (!pass || !denyReason.trim()) return;
    setActionBusy(true);
    try {
      await api.post(`/passes/${pass.id}/deny`, { reason: denyReason });
      toast({ variant: 'success', title: 'Entry denied — logged' });
      setDenyOpen(false);
      setDenyReason('');
      setPass(null);
      setCodeInput('');
      refreshLogs();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Could not log denial', description: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  const valid = pass?.validity?.valid;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-icon bg-midnight">
          <ScanLine className="h-6 w-6 text-white" />
        </div>
        <h1 className="mt-3 font-display text-heading-lg leading-tight text-charcoal-primary">
          Gate console
        </h1>
        <p className="mt-1 text-body text-muted-foreground">
          Scan the visitor&rsquo;s QR or enter their pass code.
        </p>
      </header>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleVerify} className="space-y-3">
            <Label htmlFor="code" className="text-center block">Pass code</Label>
            <Input
              id="code"
              placeholder="XXXX-XXXX"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="h-14 text-center text-2xl font-mono tracking-widest"
              value={codeInput}
              onChange={(e) => setCodeInput(formatCode(e.target.value))}
              maxLength={9}
            />
            <Button type="submit" className="w-full" size="lg" disabled={searching}>
              {searching ? 'Verifying…' : 'Verify pass'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {pass && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-caption text-muted-foreground">
                  {pass.code.slice(0, 4)}-{pass.code.slice(4)}
                </p>
                <h2 className="mt-1 font-display text-heading text-charcoal-primary">
                  {pass.visitorName}
                </h2>
              </div>
              {valid ? (
                <Badge variant="success">
                  <Check className="mr-1 h-3 w-3" />
                  Valid
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <ShieldAlert className="mr-1 h-3 w-3" />
                  {reasonLabel[pass.validity?.reason] || pass.validity?.reason}
                </Badge>
              )}
            </div>

            <CardWarm className="mt-5 p-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div className="flex items-start gap-2">
                <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-caption uppercase tracking-wider text-muted-foreground">Unit</p>
                  <p className="text-graphite">
                    Unit {pass.unit?.unitNumber} · {pass.unit?.estate?.name}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <User2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-caption uppercase tracking-wider text-muted-foreground">Type</p>
                  <p className="text-graphite capitalize">{pass.type.replace('_', ' ')}</p>
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
                <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-caption uppercase tracking-wider text-muted-foreground">Uses</p>
                  <p className="text-graphite">
                    {pass.usesCount} / {pass.maxUses}
                  </p>
                </div>
              </div>
            </CardWarm>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {valid ? (
                <Button size="lg" onClick={() => handleEntry()} disabled={actionBusy}>
                  <Check className="mr-1.5 h-4 w-4" />
                  Allow entry
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => setOverrideOpen(true)}
                  disabled={actionBusy}
                >
                  <ShieldAlert className="mr-1.5 h-4 w-4" />
                  Override entry
                </Button>
              )}
              <Button size="lg" variant="secondary" onClick={handleExit} disabled={actionBusy}>
                <LogOut className="mr-1.5 h-4 w-4" />
                Log exit
              </Button>
              <Button
                size="lg"
                variant="destructive"
                onClick={() => setDenyOpen(true)}
                disabled={actionBusy}
              >
                <X className="mr-1.5 h-4 w-4" />
                Deny
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">
            Today&rsquo;s activity
          </h3>
          {todayLogs.length === 0 ? (
            <p className="mt-3 text-caption text-muted-foreground">No entries logged yet today.</p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-surface">
              {todayLogs.slice(0, 20).map((log: any) => (
                <li key={log.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={cn('text-caption font-medium uppercase tracking-wider whitespace-nowrap', logTypeColor[log.type])}>
                      {log.type.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-charcoal-primary truncate">
                      {log.gatePass?.visitorName}
                    </span>
                    <span className="text-caption text-muted-foreground whitespace-nowrap">
                      Unit {log.gatePass?.unit?.unitNumber}
                    </span>
                  </div>
                  <span className="text-caption text-muted-foreground whitespace-nowrap">
                    {new Date(log.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Override drawer */}
      <Drawer open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>Override entry?</DrawerTitle>
            <DrawerDescription>
              This pass is not currently valid. Provide a reason for allowing entry — it will be
              logged with your operator ID for audit.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <textarea
              className="flex min-h-[120px] w-full rounded-lg bg-card px-3 py-2 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
              placeholder="e.g. Resident called ahead and confirmed visitor."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
          </DrawerBody>
          <DrawerFooter>
            <Button
              onClick={() => handleEntry(overrideReason)}
              disabled={!overrideReason.trim() || actionBusy}
            >
              Log override
            </Button>
            <DrawerClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Deny drawer */}
      <Drawer open={denyOpen} onOpenChange={setDenyOpen}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle>Deny entry</DrawerTitle>
            <DrawerDescription>Record why entry was denied for audit.</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <textarea
              className="flex min-h-[120px] w-full rounded-lg bg-card px-3 py-2 text-sm text-foreground shadow-inset-stone focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40"
              placeholder="e.g. Visitor's ID did not match the pass."
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
            />
          </DrawerBody>
          <DrawerFooter>
            <Button variant="destructive" onClick={handleDeny} disabled={!denyReason.trim() || actionBusy}>
              Deny entry
            </Button>
            <DrawerClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
