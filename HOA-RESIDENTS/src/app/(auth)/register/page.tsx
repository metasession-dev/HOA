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
 */
import Link from 'next/link';
import { Mail, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function RegisterPage() {
  return (
    <Card>
      <CardContent className="space-y-5 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--c-brand-green-light)]/15 ring-1 ring-[color:var(--c-brand-green)]/20">
          <ShieldCheck className="h-7 w-7 text-[color:var(--c-brand-green)]" strokeWidth={1.75} />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-heading text-charcoal-primary">Resident access is invite-only</h2>
          <p className="text-body text-muted-foreground">
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

        <div className="flex flex-col gap-2 pt-2">
          <Button asChild className="w-full">
            <Link href="/login">I already have an account · Sign in</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <a href="mailto:support@hoa.africa?subject=Resident%20access%20request">
              Email HOA.africa support
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
