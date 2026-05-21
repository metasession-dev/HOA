import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-200 ease-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Dark pill — primary CTA
        default:
          'rounded-pill bg-midnight text-white hover:bg-charcoal-primary',
        // Light pill — secondary CTA
        secondary:
          'rounded-pill bg-secondary text-midnight hover:bg-stone-surface',
        // Outlined nav button — for tertiary actions in nav contexts
        outline:
          'rounded-[12px] border border-graphite/30 bg-transparent text-graphite hover:border-graphite hover:bg-stone-surface',
        // Ghost — minimal hover
        ghost:
          'rounded-[10px] text-graphite hover:bg-stone-surface hover:text-midnight',
        // Destructive — dark pill in coral
        destructive:
          'rounded-pill bg-destructive text-white hover:bg-destructive/90',
        // Inline link — ember-orange, no shell
        link:
          'text-ember-orange underline-offset-4 hover:underline px-0 h-auto rounded-none',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-[14px]',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10 rounded-full p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** When true, prefixes a spinner and disables the button. Mirrors the
   *  ENTERPRISE Button so shared pages can use the same prop. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
