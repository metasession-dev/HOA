"use client";

/**
 * Split-screen sign-in for the admin console. Mirrors the marketing site's
 * Login design language (gradient hero panel on the left, focused form on
 * the right) using the apps' own brand tokens — ember-orange on a deep
 * gradient — so the look reads as one product across the marketing site
 * and the console.
 *
 * Functional surface is unchanged: useAuth().login + router.push('/admin')
 * on success, toast on failure. The visual upgrade adds:
 *   - Left "welcome" panel collapses on mobile.
 *   - Email + password fields show inline icons.
 *   - Password has a show/hide toggle (one of those small UX wins that
 *     makes troubleshooting typos painless on mobile).
 *   - "Back to home" jumps to the marketing site when configured.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || "";

function LoginInner() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  // Pre-fill email from query string — used after a successful password
  // reset so the user only has to type the new password.
  useEffect(() => {
    const pre = params.get("email");
    if (pre) setEmail(pre);
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      // Honour ?next=… set by the middleware redirect so deep-links survive
      // a forced sign-in. Validate it's a relative path to prevent open-
      // redirect: an attacker who can plant ?next=https://evil.example/
      // shouldn't be able to bounce a freshly-signed-in user there.
      const next = params.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
      router.push(safeNext);
    } catch (err: any) {
      toast({
        variant: "error",
        title: "Sign-in failed",
        description:
          err.message || "Please check your email and password and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Branded hero panel — hidden on small screens so the form stays
          uncluttered. Uses the existing brand palette rather than a
          marketing-only gradient token. */}
      <aside className="hidden lg:flex lg:w-1/2 relative overflow-hidden p-12 flex-col justify-between bg-gradient-to-br from-midnight via-charcoal-primary to-graphite">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 h-72 w-72 rounded-full bg-ember-orange/40 blur-3xl" />
          <div className="absolute bottom-20 right-20 h-96 w-96 rounded-full bg-sunburst-yellow/30 blur-3xl" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white">
            <img src="/icons/logo.png" alt="HOA.africa" className="h-12 w-12" />
          </div>
          <span className="font-display text-heading-sm text-white">
            HOA.africa
          </span>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-heading-lg leading-tight text-white">
            Run your community with calm authority.
          </h2>
          <p className="mt-4 text-body text-white/75">
            Manage levies, gate passes, vendor approvals, and governance — all
            from one console designed for African HOAs.
          </p>
        </div>

        <p className="relative z-10 text-caption text-white/55">
          Enterprise console · v1.0
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile-only header — replaces the hidden hero panel. */}
          <div className="mb-8 lg:hidden flex items-center justify-center gap-2">
            <div className="p-2 rounded-lg bg-white">
              <img src="/icons/logo.png" alt="HOA.africa" className="h-10 w-10" />
            </div>
            <span className="font-display text-heading-sm text-charcoal-primary">
              HOA.africa
            </span>
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
            <h1 className="font-display text-heading-lg leading-tight text-charcoal-primary">
              Sign in
            </h1>
            <p className="mt-1 text-body text-muted-foreground">
              Welcome back. Sign in to manage your community.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@hoa.africa"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-caption font-medium text-ember-orange hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9 pr-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-graphite transition-colors",
                  )}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 text-center text-body text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-ember-orange hover:underline"
            >
              Register your HOA
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

// useSearchParams requires a Suspense boundary in Next.js App Router.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginInner />
    </Suspense>
  );
}
