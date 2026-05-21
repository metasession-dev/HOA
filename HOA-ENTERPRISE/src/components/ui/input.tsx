import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-inset-stone placeholder:text-muted-foreground',
      'transition-shadow duration-200',
      'focus-visible:outline-none focus-visible:shadow-inset-stone-2 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
