// Public visitor-facing layout. No auth provider, no sidebar — just the
// canvas + Toaster (from root layout). Lighter weight than the portal layout.
export default function VisitorLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
