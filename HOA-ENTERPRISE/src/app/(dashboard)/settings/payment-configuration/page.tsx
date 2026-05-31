'use client';

/**
 * Per-org Paystack configuration. Admin-only.
 *
 * The secret key is write-only: the API returns `secretKeySet` (boolean) but
 * never the key itself, so we show "configured" and only send a new secret when
 * the admin types one. Until `isEnabled` is on (with a secret on file),
 * residents can't start online checkouts for this HOA.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

const selectClass = cn(
  'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone',
  'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40',
);

export default function PaymentConfigurationPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secretKeySet, setSecretKeySet] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState({
    publicKey: '',
    secretKey: '',
    subaccountCode: '',
    feeBearer: 'account',
    isEnabled: false,
    testMode: true,
  });

  useEffect(() => {
    api
      .get<any>('/payments/config/paystack')
      .then((r) => {
        const d = r.data || {};
        setSecretKeySet(!!d.secretKeySet);
        setForm({
          publicKey: d.publicKey ?? '',
          secretKey: '',
          subaccountCode: d.subaccountCode ?? '',
          feeBearer: d.feeBearer ?? 'account',
          isEnabled: !!d.isEnabled,
          testMode: d.testMode ?? true,
        });
      })
      .catch((err) => toast({ variant: 'error', title: 'Could not load configuration', description: err.message }))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        publicKey: form.publicKey.trim() || null,
        subaccountCode: form.subaccountCode.trim() || null,
        feeBearer: form.feeBearer,
        isEnabled: form.isEnabled,
        testMode: form.testMode,
      };
      // Only send the secret when the admin actually typed a new one.
      if (form.secretKey.trim()) payload.secretKey = form.secretKey.trim();
      const r = await api.put<any>('/payments/config/paystack', payload);
      setSecretKeySet(!!r.data?.secretKeySet);
      setForm((f) => ({ ...f, secretKey: '' }));
      toast({ variant: 'success', title: 'Payment configuration saved' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Save failed', description: err.message });
    } finally {
      setSaving(false);
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

  return (
    <div className="space-y-6">
      <Link href="/settings" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-graphite">
        <ChevronLeft className="h-3 w-3" />Settings
      </Link>

      <header>
        <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Payment configuration</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Connect your HOA&rsquo;s Paystack account. Residents&rsquo; levy payments settle directly into it.
        </p>
      </header>

      <form onSubmit={save}>
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center gap-2">
              <h3 className="text-heading-sm font-display font-medium text-charcoal-primary">Paystack</h3>
              {form.isEnabled ? (
                <Badge variant="success">Live</Badge>
              ) : (
                <Badge variant="muted">Not enabled</Badge>
              )}
              {form.testMode && <Badge variant="warning">Test mode</Badge>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="publicKey">Public key</Label>
              <Input
                id="publicKey"
                value={form.publicKey}
                onChange={(e) => setForm({ ...form, publicKey: e.target.value })}
                placeholder="pk_test_… or pk_live_…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="secretKey">Secret key</Label>
              <div className="relative">
                <Input
                  id="secretKey"
                  type={showSecret ? 'text' : 'password'}
                  className="pr-9"
                  value={form.secretKey}
                  onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
                  placeholder={secretKeySet ? '•••••••••• (leave blank to keep current)' : 'sk_test_… or sk_live_…'}
                  autoComplete="off"
                />
                <button
                  type="button"
                  aria-label={showSecret ? 'Hide' : 'Show'}
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-graphite"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                {secretKeySet ? 'A secret key is on file (encrypted).' : 'Stored encrypted; never shown again after saving.'}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="subaccount">Subaccount code (optional)</Label>
                <Input
                  id="subaccount"
                  value={form.subaccountCode}
                  onChange={(e) => setForm({ ...form, subaccountCode: e.target.value })}
                  placeholder="ACCT_…"
                />
                <p className="text-caption text-muted-foreground">For split settlement.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feeBearer">Who bears the Paystack fee</Label>
                <select
                  id="feeBearer"
                  className={selectClass}
                  value={form.feeBearer}
                  onChange={(e) => setForm({ ...form, feeBearer: e.target.value })}
                >
                  <option value="account">Your HOA account</option>
                  <option value="subaccount">Subaccount</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-lg bg-stone-surface/40 p-3">
              <input
                type="checkbox"
                checked={form.testMode}
                onChange={(e) => setForm({ ...form, testMode: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm text-graphite">Test mode (use Paystack test keys; no real money moves)</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg bg-stone-surface/40 p-3">
              <input
                type="checkbox"
                checked={form.isEnabled}
                onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm text-graphite">
                Enable online payments for residents
                <span className="block text-caption text-muted-foreground">Requires a secret key on file.</span>
              </span>
            </label>

            <div className="flex justify-end pt-1">
              <Button type="submit" loading={saving}>{saving ? 'Saving…' : 'Save configuration'}</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
