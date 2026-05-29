'use client';

/**
 * Resident sign-up is invite-only. This page used to host a public self-serve
 * form that let anyone spin up their own org — wrong surface for the resident
 * PWA. Now it's a polite landing page that directs would-be residents to
 * ask their HOA admin for an invitation email.
 *
 * Real signup happens at /invites/[token] — that page validates the token,
 * pre-fills first/last/email from the invite row, and creates the User +
 * UnitOccupancy linkage in one transaction.
 *
 * Layout mirrors the sign-in page: split-screen with the gradient hero panel
 * on the left and the focused content on the right, so the two screens read
 * as one product.
 */
import Link from 'next/link';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || '';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex lg:w-1/2 relative overflow-hidden p-12 flex-col justify-between bg-gradient-to-br from-midnight via-charcoal-primary to-graphite">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 h-72 w-72 rounded-full bg-ember-orange/40 blur-3xl" />
          <div className="absolute bottom-20 right-20 h-96 w-96 rounded-full bg-meadow-green/30 blur-3xl" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white">
            <img src="/icons/logo.png" alt="HOA.africa" className="h-12 w-12" />
          </div>
          <span className="font-display text-heading-sm text-white">HOA.africa</span>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-heading-lg leading-tight text-white">
            Welcome home.
          </h2>
          <p className="mt-4 text-body text-white/75">
            Pay levies, submit requests, issue gate passes for visitors, and
            stay across what's happening in your community — all from your
            phone.
          </p>
        </div>

        <p className="relative z-10 text-caption text-white/55">
          Resident portal · invitation only
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
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--c-brand-green-light)]/15 ring-1 ring-[color:var(--c-brand-green)]/20">
              <ShieldCheck className="h-7 w-7 text-[color:var(--c-brand-green)]" strokeWidth={1.75} />
            </div>
            <h1 className="mt-4 font-display text-heading-lg leading-tight text-charcoal-primary">
              Resident access is invite-only
            </h1>
            <p className="mt-1 text-body text-muted-foreground">
              Your HOA admin will send an invitation to your registered email. Open that email and click the link to set up your account.
            </p>
          </div>

          <div className="rounded-lg bg-stone-surface/60 p-4 text-left">
            <p className="flex items-center gap-2 text-caption font-medium text-charcoal-primary">
              <Mail className="h-3.5 w-3.5 text-ember-orange" />
              Don&rsquo;t have an invitation?
            </p>
            <p className="mt-1 text-caption text-graphite">
              Contact your HOA admin or the management office and ask them to send your invite. Once you receive the email, the link will bring you straight here.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Button asChild className="w-full" size="lg">
              <Link href="/login">I already have an account · Sign in</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <a href="mailto:dev@metasession.co?subject=Resident%20access%20request">
                Email HOA.africa support
              </a>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
