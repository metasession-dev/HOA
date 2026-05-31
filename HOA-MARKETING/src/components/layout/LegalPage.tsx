import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Header from "./Header";
import Footer from "./Footer";

/**
 * Shared shell for the three legal pages (Privacy, Terms, Cookies).
 *
 * Why a shared component instead of duplicating per-page chrome:
 *   - The legal pages share 100% of the layout — only body content
 *     differs. Centralising the hero, breadcrumb, and last-updated
 *     stamp keeps them visually consistent and easy to maintain.
 *   - Updating the "Effective date" UI in one place propagates to all
 *     three pages instead of risking drift.
 *   - Title gets pushed into document.title on mount so search engines
 *     and tab labels reflect the actual page (Vite/SPA convention).
 *
 * Content authors pass children as plain JSX — typography classes are
 * applied via the `prose` wrapper so headings/paragraphs/lists get
 * consistent spacing without per-element styling.
 */

interface LegalPageProps {
  title: string;
  subtitle?: string;
  effectiveDate: string;
  children: ReactNode;
}

const LegalPage = ({ title, subtitle, effectiveDate, children }: LegalPageProps) => {
  // SPA — no Next.js metadata API. Set the document title imperatively
  // on mount and reset on unmount so the browser tab + history label
  // reflect the right page. The dependency array intentionally includes
  // `title` for the rare case a child component renames the page.
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | HOA Africa`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* pt-24 lg:pt-28 leaves room for the fixed header (h-16/h-20) plus
          a comfortable visual gap above the page title. */}
      <main className="flex-1 pt-24 lg:pt-28">
        <div className="container mx-auto px-4 py-12 lg:py-16 max-w-4xl">
          {/* Breadcrumb-style "back to home" anchor. Keyboard-accessible
              and uses Router Link so navigation stays in the SPA. */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <header className="mb-10 lg:mb-12 pb-8 border-b border-border">
            <h1 className="font-bold text-3xl lg:text-5xl text-foreground mb-3 leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-lg text-muted-foreground leading-relaxed">
                {subtitle}
              </p>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Effective date:</span> {effectiveDate}
            </p>
          </header>

          {/*
            Typography defaults come from @tailwindcss/typography's `prose`
            class. We bump the dark-mode contrast and let the user agent
            handle font sizing — body text inherits site font (Outfit) from
            the global stylesheet, headings use the same family for
            visual cohesion.
          */}
          <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary hover:prose-a:underline prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-table:my-6">
            {children}
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default LegalPage;
