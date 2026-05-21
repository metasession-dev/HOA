import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from './card';
import { cn } from '@/lib/utils';

/**
 * Stat card — the small "label + big number + accent icon" block that lives
 * at the top of most admin pages (gate passes, dashboard, finance, etc.).
 *
 * Pattern: label uppercase + muted, value display-font, icon as a tinted
 * circle on the right. The icon background should pair with its text colour
 * (e.g. `text-meadow-green bg-meadow-green/10`) — pass both via `iconClass`.
 *
 * Optional `delta` shows a percent change relative to the previous period
 * (green when positive, red when negative). Pass `null` to omit.
 */
export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Combined classes for icon colour + bg tint. */
  iconClass?: string;
  /** Optional small caption under the value. */
  hint?: string;
  /** Optional trend marker (e.g. "+12% vs. last week"). */
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  className?: string;
}

export function StatCard({ label, value, icon: Icon, iconClass, hint, delta, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="flex items-start gap-4 p-5">
        <div className="flex-1 min-w-0">
          <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-heading text-charcoal-primary tabular-nums">
            {value}
          </p>
          {hint && <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>}
          {delta && (
            <p
              className={cn(
                'mt-1 text-caption font-medium',
                delta.direction === 'up' && 'text-meadow-green',
                delta.direction === 'down' && 'text-coral-red',
                delta.direction === 'flat' && 'text-muted-foreground',
              )}
            >
              {delta.direction === 'up' && '↑ '}
              {delta.direction === 'down' && '↓ '}
              {delta.value}
            </p>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              iconClass ?? 'text-graphite bg-stone-surface',
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
