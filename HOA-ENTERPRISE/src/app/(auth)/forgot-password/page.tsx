'use client';

/**
 * Forgot-password — step 1: capture the email + ask the API to send a
 * reset link. Server NEVER reveals whether the email is on file, so this
 * UI always shows the same success state regardless of outcome. Trying to
 * be clever ("we couldn't find that email") would gift an attacker a free
 * user-enumeration oracle.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || '';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post<any>('/auth/password-reset/request', {
        email: email.trim().toLowerCase(),
        app: 'enterprise',
      });
      setSent(true);
    } catch (err: any) {
      toast({
        variant: 'error',
        title: "Couldn't request reset",
        description: err?.message || 'Try again in a moment.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex lg:w-1/2 relative overflow-hidden p-12 flex-col justify-between bg-gradient-to-br from-midnight via-charcoal-primary to-graphite">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 h-72 w-72 rounded-full bg-ember-orange/40 blur-3xl" />
          <div className="absolute bottom-20 right-20 h-96 w-96 rounded-full bg-sunburst-yellow/30 blur-3xl" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white">
            <img src="/icons/logo.png" alt="HOA.africa" className="h-12 w-12" />
          </div>
          <span className="font-display text-heading-sm text-white">HOA.africa</span>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-heading-lg leading-tight text-white">
            Reset your password.
          </h2>
          <p className="mt-4 text-body text-white/75">
            Enter the email on your account and we'll send a one-time link.
            The link expires in 30 minutes and works exactly once.
          </p>
        </div>

        <p className="relative z-10 text-caption text-white/55">
          Need help? <a href="mailto:support@hoa.africa" className="underline">support@hoa.africa</a>
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
              Forgot your password?
            </h1>
            <p className="mt-1 text-body text-muted-foreground">
              We'll email you a reset link.
            </p>
          </div>

          {sent ? (
            <div className="space-y-5">
              <div className="rounded-lg bg-meadow-green/10 px-4 py-3 text-sm text-meadow-green">
                If <strong className="font-medium">{email.trim().toLowerCase()}</strong> is on file,
                a reset link is on its way. Check your inbox (and spam folder).
                The link expires in 30 minutes.
              </div>
              <p className="text-caption text-muted-foreground">
                Nothing arriving? You can request another link in a minute.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => { setSent(false); setEmail(''); }}
              >
                Use a different email
              </Button>
              <Link
                href="/login"
                className="block text-center text-body text-muted-foreground hover:text-graphite"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" loading={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>

              {MARKETING_URL && (
                <p className="text-center text-caption text-muted-foreground">
                  <a href={MARKETING_URL} className="hover:underline">
                    Back to hoa.africa
                  </a>
                </p>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
