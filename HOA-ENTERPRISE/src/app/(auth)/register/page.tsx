'use client';

/**
 * Split-screen registration to match the marketing site + new login design.
 * Same hero-left, form-right layout; copy on the hero panel is tuned for
 * the "you're about to spin up a workspace" moment rather than the
 * sign-in moment.
 *
 * Functional surface is unchanged: useAuth().register() then redirect.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || '';

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', organizationName: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      toast({ variant: 'success', title: 'Welcome to HOA.africa', description: 'Your workspace is ready.' });
      router.push('/admin');
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Registration failed',
        description: err.message || 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

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
            Spin up your community in two minutes.
          </h2>
          <p className="mt-4 text-body text-white/75">
            We'll create a fresh workspace, seed sensible defaults (chart of
            accounts, approval rules, request categories), and walk you through
            inviting your team and residents.
          </p>
          <ul className="mt-6 space-y-2 text-body text-white/75">
            <li>• 14-day free trial · no card required</li>
            <li>• Levies, gate passes, vendor approvals out of the box</li>
            <li>• Resident PWA included</li>
          </ul>
        </div>

        <p className="relative z-10 text-caption text-white/55">
          You're the first admin. You can invite the rest of your board after.
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
            {MARKETING_URL && (
              <a
                href={MARKETING_URL}
                className="mb-6 inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-graphite transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to hoa.africa
              </a>
            )}
            <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">Create your workspace</h1>
            <p className="mt-1 text-body text-muted-foreground">
              Set up your HOA in two minutes. You can invite the rest of your board later.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="firstName" className="pl-9" value={form.firstName} onChange={update('firstName')} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" value={form.lastName} onChange={update('lastName')} required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" autoComplete="email" className="pl-9" value={form.email} onChange={update('email')} required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pl-9 pr-9"
                  value={form.password}
                  onChange={update('password')}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-graphite transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-caption text-muted-foreground">At least 8 characters.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="orgName">HOA / Organization name</Label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="orgName"
                  placeholder="e.g. Sunset Estate HOA"
                  className="pl-9"
                  value={form.organizationName}
                  onChange={update('organizationName')}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              {loading ? 'Creating workspace…' : 'Create workspace'}
            </Button>
          </form>

          <p className="mt-8 text-center text-body text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-ember-orange hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
