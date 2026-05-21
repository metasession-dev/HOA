'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Card-vs-Table view toggle for list pages. Selection persists per page
 * (scoped by `storageKey`) so a user who prefers the table view on Payables
 * doesn't end up with cards on Estates.
 *
 * Usage:
 *   const [view, setView] = useViewMode('estates', 'card');
 *   <ViewToggle value={view} onChange={setView} />
 *   {view === 'card' ? <Grid/> : <Table/>}
 *
 * Visual is a segmented control matching the new contrast tokens — sits
 * neatly to the right of a page header.
 */
export type ViewMode = 'card' | 'table';

export function useViewMode(storageKey: string, fallback: ViewMode = 'card'): [ViewMode, (m: ViewMode) => void] {
  const key = `hoa.view.${storageKey}`;
  const [mode, setModeState] = useState<ViewMode>(fallback);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(key) as ViewMode | null;
    if (saved === 'card' || saved === 'table') setModeState(saved);
  }, [key]);

  const setMode = (m: ViewMode) => {
    setModeState(m);
    try {
      localStorage.setItem(key, m);
    } catch {
      /* private-mode browsers — silent. */
    }
  };

  return [mode, setMode];
}

export function ViewToggle({
  value,
  onChange,
  className,
}: {
  value: ViewMode;
  onChange: (m: ViewMode) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-pill bg-stone-surface p-0.5',
        className,
      )}
    >
      <ToggleButton active={value === 'card'} label="Cards" onClick={() => onChange('card')}>
        <LayoutGrid className="h-3.5 w-3.5" />
      </ToggleButton>
      <ToggleButton active={value === 'table'} label="Table" onClick={() => onChange('table')}>
        <Rows3 className="h-3.5 w-3.5" />
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-caption transition-colors',
        active
          ? 'bg-card text-charcoal-primary shadow-inset-stone font-medium'
          : 'text-graphite hover:text-charcoal-primary',
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
