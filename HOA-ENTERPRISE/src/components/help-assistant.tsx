'use client';

/**
 * "Aida" — an in-app, page-aware help assistant (Clippy, but tasteful).
 *
 * A floating helper that explains how to use whatever page you're on, using the
 * curated guidance in lib/help-content.ts. It's a friendly guided assistant
 * (instant + always correct), not a free-text bot. The user can hide the helper
 * button entirely (persisted) and bring it back from the small restore chip.
 */
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Lightbulb, ChevronDown, EyeOff, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { helpFor } from '@/lib/help-content';

const HIDDEN_KEY = 'aida.hidden';
const SEEN_KEY = 'aida.seen';

export function HelpAssistant() {
  const pathname = usePathname() || '';
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === '1');
      // Pulse the helper once for first-time users so they notice it.
      if (!localStorage.getItem(SEEN_KEY)) {
        setPulse(true);
        const t = setTimeout(() => setPulse(false), 6000);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);

  // New page → reset any expanded FAQ.
  useEffect(() => { setOpenFaq(null); }, [pathname]);

  const entry = useMemo(() => helpFor(pathname), [pathname]);

  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ } setPulse(false); };
  const hide = () => {
    setHidden(true); setOpen(false);
    try { localStorage.setItem(HIDDEN_KEY, '1'); } catch { /* ignore */ }
  };
  const restore = () => {
    setHidden(false);
    try { localStorage.removeItem(HIDDEN_KEY); } catch { /* ignore */ }
  };

  if (!mounted) return null;

  // Hidden state: a small, low-profile chip to bring the helper back.
  if (hidden) {
    return (
      <button
        type="button"
        onClick={restore}
        title="Show the help assistant"
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-stone-surface bg-card/90 px-2.5 py-1.5 text-caption text-muted-foreground shadow-soft backdrop-blur hover:text-graphite"
      >
        <HelpCircle className="h-3.5 w-3.5" /> Help
      </button>
    );
  }

  return (
    <>
      <style>{`@keyframes aida-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}`}</style>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Help assistant"
          className="fixed bottom-24 right-4 z-50 flex max-h-[72vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-stone-surface bg-card shadow-lg sm:right-6"
        >
          <header className="flex items-center gap-3 border-b border-stone-surface bg-stone-surface/40 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ember-orange/15 text-ember-orange">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-charcoal-primary">Aida · your guide</p>
              <p className="text-caption text-muted-foreground">Help for: {entry.title}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-stone-surface hover:text-graphite">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* The helper "says" the intro */}
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember-orange/15 text-ember-orange">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <p className="rounded-2xl rounded-tl-sm bg-stone-surface/60 px-3 py-2 text-sm text-graphite">{entry.intro}</p>
            </div>

            <div className="space-y-2">
              <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">How to use this page</p>
              <ul className="space-y-2">
                {entry.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-graphite">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-ember-orange" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {entry.faqs && entry.faqs.length > 0 && (
              <div className="space-y-2">
                <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">Common questions</p>
                <div className="space-y-1.5">
                  {entry.faqs.map((f, i) => (
                    <div key={i} className="rounded-lg border border-stone-surface">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-charcoal-primary"
                      >
                        {f.q}
                        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', openFaq === i && 'rotate-180')} />
                      </button>
                      {openFaq === i && <p className="px-3 pb-2.5 text-caption text-muted-foreground">{f.a}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between gap-2 border-t border-stone-surface px-4 py-2.5">
            <button type="button" onClick={hide} className="inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-graphite">
              <EyeOff className="h-3.5 w-3.5" /> Hide helper
            </button>
            <span className="text-caption text-muted-foreground">I update for every page</span>
          </footer>
        </div>
      )}

      {/* Floating button (animated mascot) */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); markSeen(); }}
        aria-label={open ? 'Close help' : 'Open help assistant'}
        className="fixed bottom-5 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-charcoal-primary text-white shadow-lg transition-transform hover:scale-105 sm:right-6"
      >
        {pulse && !open && <span className="absolute inset-0 animate-ping rounded-full bg-ember-orange/40" />}
        <span style={{ animation: open ? undefined : 'aida-bob 2.6s ease-in-out infinite' }}>
          {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6 text-ember-orange" />}
        </span>
      </button>
    </>
  );
}
