import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

/**
 * Empty-state primitive. Replaces the ad-hoc "Card-inside-Card with margin"
 * pattern that was visually breaking after the canvas contrast bump.
 *
 * Usage:
 *   <EmptyState icon={KeyRound} title="No passes yet"
 *               description="Once residents create gate passes, they'll appear here."
 *               action={{ label: 'View resident guide', href: '/help/gate-passes' }} />
 *
 * Two visual variants:
 *   - `default` (default) — for use *inside* an existing Card. No background;
 *     fills the host container with comfortable vertical padding.
 *   - `card` — standalone panel with parchment background and rounded border.
 *     Use when the empty state is the only thing on the page section.
 *
 * The icon sits in a 56×56 brand-tinted circle so the empty state has a clear
 * focal point rather than relying on the gray Lucide stroke alone.
 */
export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  variant?: 'default' | 'card';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  variant = 'default',
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center text-center px-6',
        // `default` is meant to live INSIDE an existing surface — no bg, no border.
        // `card` is its own surface — parchment background + rounded corner.
        variant === 'card'
          ? 'rounded-card-lg bg-parchment-card py-16'
          : 'py-14',
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            'mb-4 flex h-14 w-14 items-center justify-center rounded-full',
            // Soft brand-green tint with a subtle ring — gives the icon a focal
            // point without screaming for attention.
            'bg-[color:var(--c-brand-green-light)]/15 ring-1 ring-[color:var(--c-brand-green)]/20',
          )}
        >
          <Icon className="h-6 w-6 text-[color:var(--c-brand-green)]" strokeWidth={1.75} />
        </div>
      )}

      <h3 className="font-display text-heading-sm font-medium text-charcoal-primary">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-md text-body text-muted-foreground">
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action && <ActionButton {...action} />}
          {secondaryAction && (
            <ActionButton variant={secondaryAction.variant ?? 'ghost'} {...secondaryAction} />
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, href, onClick, variant = 'default' }: EmptyStateAction) {
  if (href) {
    return (
      <Button asChild variant={variant}>
        <Link href={href}>{label}</Link>
      </Button>
    );
  }
  return (
    <Button variant={variant} onClick={onClick}>
      {label}
    </Button>
  );
}
