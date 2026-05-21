/**
 * Thin auth-layout wrapper. The redesigned login/register pages own their
 * full split-screen layout, so the wrapper just provides a stable
 * background and lets each page draw edge-to-edge.
 *
 * The invites/[token] redeem page also lives outside this group, so the
 * "Resident portal" label that used to sit here is now baked into each
 * page's hero panel where appropriate.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
