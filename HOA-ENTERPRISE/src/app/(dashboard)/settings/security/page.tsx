'use client';

import { useEffect, useState } from 'react';
import { Shield, Smartphone, Key, AlertTriangle, CheckCircle2, Lock, LogOut } from 'lucide-react';
import { api } from '@/lib/api';
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

type MfaStatus = { totpEnabled: boolean; totpEnabledAt: string | null; recoveryCodesRemaining: number };

export default function SecuritySettingsPage() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Enrollment state
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [code, setCode] = useState('');

  // Post-enroll
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Disable
  const [showDisable, setShowDisable] = useState(false);
  const [disablePwd, setDisablePwd] = useState('');
  const [disableMfaCode, setDisableMfaCode] = useState('');

  // Sessions
  const [sessions, setSessions] = useState<any[]>([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<any>('/security/mfa/status').then((r) => setStatus(r.data)),
      api.get<any>('/security/sessions').then((r) => setSessions(r.data || [])).catch(() => setSessions([])),
    ]).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const startEnroll = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>('/security/mfa/enroll/start', {});
      setSecret(r.data.secret);
      setOtpauthUri(r.data.otpauthUri);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Enroll failed', description: err.message });
    } finally { setBusy(false); }
  };

  const verifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return toast({ variant: 'error', title: 'Enter the 6-digit code' });
    setBusy(true);
    try {
      const r = await api.post<any>('/security/mfa/enroll/verify', { code: code.trim() });
      setRecoveryCodes(r.data.recoveryCodes);
      setSecret(null); setOtpauthUri(null); setCode('');
      toast({ variant: 'success', title: 'MFA enabled', description: 'Save your recovery codes — they only display once.' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Invalid code', description: err.message });
    } finally { setBusy(false); }
  };

  const disable = async () => {
    if (!disablePwd) return toast({ variant: 'error', title: 'Password required' });
    if (!disableMfaCode.trim()) return toast({ variant: 'error', title: 'MFA code or recovery code required' });
    setBusy(true);
    try {
      await api.post('/security/mfa/disable', { password: disablePwd, mfaCode: disableMfaCode.trim() });
      toast({ variant: 'success', title: 'MFA disabled' });
      setShowDisable(false); setDisablePwd(''); setDisableMfaCode('');
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Disable failed', description: err.message });
    } finally { setBusy(false); }
  };

  const regenerateRecovery = async () => {
    const ok = await confirm({
      title: 'Regenerate recovery codes?',
      description: 'Your existing codes will stop working. Save the new codes immediately.',
      confirmText: 'Regenerate',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post<any>('/security/mfa/recovery-codes/regenerate', {});
      setRecoveryCodes(r.data.recoveryCodes);
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    } finally { setBusy(false); }
  };

  const revokeSession = async (s: any) => {
    const ok = await confirm({
      title: 'Revoke this session?',
      description: `${s.deviceLabel || s.ipAddress || 'Unknown device'} will be signed out immediately.`,
      confirmText: 'Revoke',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/security/sessions/${s.id}`);
      toast({ variant: 'success', title: 'Session revoked' });
      load();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  const forceLogoutAll = async () => {
    const ok = await confirm({
      title: 'Sign out everywhere?',
      description: 'All your sessions across all devices will be terminated. You will need to sign in again.',
      confirmText: 'Sign out all',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.post('/security/sessions/force-logout-self', {});
      toast({ variant: 'success', title: 'All sessions signed out' });
      // The user's current token is now invalid — redirect them to login.
      setTimeout(() => { window.location.href = '/login'; }, 800);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Security</h1>
        <p className="mt-1 text-body text-muted-foreground">Two-factor authentication, recovery codes, and active sessions.</p>
      </header>

      {/* MFA status card */}
      <Card>
        <CardContent className="p-6">
          {loading || !status ? <Skeleton className="h-24" /> : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${status.totpEnabled ? 'bg-meadow-green/15 text-meadow-green' : 'bg-stone-surface text-graphite'}`}>
                    {status.totpEnabled ? <CheckCircle2 className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Two-factor authentication</h3>
                    <p className="text-caption text-muted-foreground">
                      {status.totpEnabled ? (
                        <>Enabled. Recovery codes remaining: <strong>{status.recoveryCodesRemaining}</strong>.</>
                      ) : (
                        'Add a one-time-code app (Google Authenticator, 1Password, Authy) for stronger sign-in security.'
                      )}
                    </p>
                  </div>
                </div>
                {status.totpEnabled ? (
                  <Button variant="secondary" onClick={() => setShowDisable(true)}>Disable</Button>
                ) : !secret ? (
                  <Button onClick={startEnroll} disabled={busy}><Smartphone className="mr-1.5 h-4 w-4" />Enable</Button>
                ) : null}
              </div>

              {status.totpEnabled && status.recoveryCodesRemaining <= 3 && (
                <div className="mt-3 rounded-lg p-3 bg-deep-amber/10 flex items-start gap-2 text-caption text-graphite">
                  <AlertTriangle className="h-3.5 w-3.5 text-deep-amber shrink-0 mt-0.5" />
                  Recovery codes are running low. <button onClick={regenerateRecovery} className="ml-1 text-ember-orange hover:underline">Regenerate now</button>.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Enrollment flow */}
      {secret && otpauthUri && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Scan in your authenticator app</h3>
            <div className="rounded-lg bg-stone-surface/50 p-4 space-y-3">
              <p className="text-caption text-muted-foreground">If your app can't scan a QR, enter this secret manually:</p>
              <code className="block break-all text-xs font-mono bg-card rounded px-2 py-1.5 shadow-inset-stone">{secret}</code>
              <p className="text-caption text-muted-foreground">otpauth URI:</p>
              <code className="block break-all text-xs font-mono bg-card rounded px-2 py-1.5 shadow-inset-stone">{otpauthUri}</code>
            </div>
            <form onSubmit={verifyEnroll}>
              <Label>Verification code</Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
                  placeholder="123456"
                  maxLength={8}
                  inputMode="numeric"
                  autoFocus
                />
                <Button type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify & enable'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Recovery codes (display-once) */}
      {recoveryCodes && (
        <Card>
          <CardContent className="p-6">
            <div className="rounded-lg p-3 bg-coral-red/5 border border-coral-red/20 mb-4 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-coral-red shrink-0 mt-0.5" />
              <p className="text-sm text-charcoal-primary">
                <strong>Save these codes now.</strong> They won't be shown again. Each code works once and lets you log in if you lose access to your authenticator.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <div key={c} className="rounded bg-stone-surface/50 px-3 py-2 text-graphite">{c}</div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => {
                navigator.clipboard.writeText(recoveryCodes.join('\n'));
                toast({ variant: 'success', title: 'Codes copied to clipboard' });
              }}>Copy all</Button>
              <Button onClick={() => setRecoveryCodes(null)}>I've saved them</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active sessions */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Active sessions</h3>
            <Button variant="secondary" size="sm" onClick={forceLogoutAll}><LogOut className="mr-1.5 h-3.5 w-3.5" />Sign out everywhere</Button>
          </div>
          {loading ? <Skeleton className="h-16" /> : sessions.length === 0 ? (
            <p className="text-caption text-muted-foreground">No active sessions besides this browser.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-start justify-between rounded-lg p-3 bg-stone-surface/50">
                  <div className="min-w-0">
                    <p className="text-sm text-graphite font-medium">{s.deviceLabel || 'Browser session'}</p>
                    <p className="text-caption text-muted-foreground">
                      {s.ipAddress || 'unknown IP'} · last used {new Date(s.lastUsedAt).toLocaleString()}
                    </p>
                    {s.trustedDevice && <Badge variant="success" className="mt-1">trusted</Badge>}
                  </div>
                  <button onClick={() => revokeSession(s)} className="text-coral-red/70 hover:text-coral-red text-xs">Revoke</button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disable MFA drawer */}
      <Drawer open={showDisable} onOpenChange={setShowDisable}>
        <DrawerContent size="md">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-coral-red" />Disable two-factor auth
            </DrawerTitle>
            <DrawerDescription>
              For security, this requires both your password AND a current MFA code (or a recovery code).
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={disablePwd} onChange={(e) => setDisablePwd(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>MFA code or recovery code</Label>
              <Input value={disableMfaCode} onChange={(e) => setDisableMfaCode(e.target.value)} placeholder="123456 or AAAAA-BBBBB" />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="destructive" disabled={busy || !disablePwd || !disableMfaCode} onClick={disable}>Disable MFA</Button>
            <Button variant="secondary" onClick={() => setShowDisable(false)}>Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
