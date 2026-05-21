import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-tight tracking-[-0.005em] transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-midnight text-white',
        secondary: 'bg-stone-surface text-charcoal-primary',
        outline: 'border border-graphite/25 text-graphite bg-transparent',
        muted: 'bg-parchment-card text-graphite',
        success: 'bg-valid-green/15 text-valid-green',
        warning: 'bg-sunburst-yellow/20 text-deep-amber',
        info: 'bg-sky-blue/15 text-ocean-blue',
        destructive: 'bg-coral-red/15 text-coral-red',
        accent: 'bg-ember-orange/15 text-ember-orange',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
