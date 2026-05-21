'use client';

/**
 * Forgot-password — step 2: token from the URL + new password. On success
 * we redirect to /login with the email pre-filled so the user signs in
 * with the new password immediately (no auto-login — we want a deliberate
 * first sign-in with the new credential, which catches "wrong password
 * remembered" early).
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [missingToken, setMissingToken] = useState(false);

  useEffect(() => {
    if (!token) setMissingToken(true);
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ variant: 'error', title: 'Password too short', description: 'Use at least 8 characters.' });
      return;
    }
    if (password !== confirm) {
      toast({ variant: 'error', title: "Passwords don't match" });
      return;
    }
    setLoading(true);
    try {
      const r = await api.post<any>('/auth/password-reset/confirm', { token, password });
      toast({ variant: 'success', title: 'Password updated', description: 'Sign in with your new password.' });
      router.replace(`/login?email=${encodeURIComponent(r.data.email)}`);
    } catch (err: any) {
      toast({
        variant: 'error',
        title: "Couldn't reset password",
        description: err?.message || 'The link may be expired or already used.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex lg:w-1/2 relative overflow-hidden p-12 flex-col justify-between bg-gradient-to-br from-midnight via-charcoal-primary to-graphite">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 h-72 w-72 rounded-full bg-meadow-green/40 blur-3xl" />
          <div className="absolute bottom-20 right-20 h-96 w-96 rounded-full bg-ember-orange/40 blur-3xl" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white">
            <img src="/icons/logo.png" alt="HOA.africa" className="h-12 w-12" />
          </div>
          <span className="font-display text-heading-sm text-white">HOA.africa</span>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-heading-lg leading-tight text-white">
            Set a new password.
          </h2>
          <p className="mt-4 text-body text-white/75">
            Pick something memorable but hard to guess. At least 8 characters —
            longer is better. Once you save, sign in with the new password.
          </p>
        </div>

        <p className="relative z-10 text-caption text-white/55">
          This link is single-use and expires after 30 minutes.
        </p>
      </aside>

      <main className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden flex items-center justify-center gap-2">
            <div className="p-2 rounded-lg bg-white">
              <img src="/icons/logo.png" alt="HOA.africa" className="h-10 w-10" />
            </div>
            <span className="font-display text-heading-sm text-charcoal-primary">HOA.africa</span>
          </div>

          <div className="mb-8">
            <Link
              href="/login"
              className="mb-6 inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-graphite transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
            <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
              Choose a new password
            </h1>
            <p className="mt-1 text-body text-muted-foreground">
              At least 8 characters. Longer + memorable beats short + complex.
            </p>
          </div>

          {missingToken ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-coral-red/10 px-4 py-3 text-sm text-coral-red">
                This page needs a reset link. Request a fresh one from the
                forgot-password page.
              </div>
              <Link href="/forgot-password" className="block">
                <Button className="w-full">Request a new link</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pl-9 pr-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-graphite"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm new password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pl-9"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" loading={loading}>
                {loading ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams requires a Suspense boundary on the App Router.
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
