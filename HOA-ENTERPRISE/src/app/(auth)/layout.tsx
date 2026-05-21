/**
 * Thin auth-layout wrapper. The login/register pages now own their full
 * layout (split-screen hero + form) so the layout itself just provides the
 * page background. We no longer centre or constrain children — pages do
 * that themselves where appropriate.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
