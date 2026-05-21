'use client';

/**
 * Right-side Drawer (Sheet) primitive — built atop @radix-ui/react-dialog so
 * we get the focus trap, Esc-to-close, scroll lock, aria-modal, and portal
 * behaviour for free.
 *
 * API mirrors `./dialog.tsx` deliberately so converting a form Dialog to a
 * Drawer is a mechanical import swap. Confirm/alert dialogs should stay on
 * `./dialog.tsx` — drawers are for non-destructive form flows where the page
 * context is useful to preserve.
 *
 * Sizes: `sm` 400px, `md` 520px, `lg` 720px, `xl` 920px. Defaults to `md`.
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Drawer = DialogPrimitive.Root;
const DrawerTrigger = DialogPrimitive.Trigger;
const DrawerPortal = DialogPrimitive.Portal;
const DrawerClose = DialogPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-midnight/30 backdrop-blur-[2px]',
      'data-[state=open]:animate-fade-in',
      'data-[state=closed]:animate-fade-in data-[state=closed]:opacity-0',
      className,
    )}
    {...props}
  />
));
DrawerOverlay.displayName = 'DrawerOverlay';

const sizeMap = {
  sm: 'max-w-[400px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[920px]',
} as const;
export type DrawerSize = keyof typeof sizeMap;

type DrawerContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: DrawerSize;
  hideClose?: boolean;
};

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, size = 'md', hideClose = false, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Pinned to the right edge, full height, slides in from the right.
        'fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col bg-card text-card-foreground',
        sizeMap[size],
        'border-l border-border shadow-2xl',
        // Animation hooks — defined in tailwind config.
        'data-[state=open]:animate-slide-in-right',
        'data-[state=closed]:animate-slide-out-right',
        className,
      )}
      {...props}
    >
      {!hideClose && (
        <DialogPrimitive.Close
          className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-stone-surface hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
      {children}
    </DialogPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

/**
 * Header section — sticky at the top of the drawer. Provides the title +
 * description above a thin divider so long forms keep context as the body
 * scrolls.
 */
const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'sticky top-0 z-10 flex flex-col gap-1 border-b border-border bg-card px-6 py-5',
      className,
    )}
    {...props}
  />
);
DrawerHeader.displayName = 'DrawerHeader';

/**
 * Scrollable body. Use `<DrawerBody>` instead of inline divs so layout +
 * padding stay consistent across the app.
 */
const DrawerBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-y-auto px-6 py-5', className)} {...props} />
);
DrawerBody.displayName = 'DrawerBody';

/** Sticky footer — usually the Save / Cancel pair. */
const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'sticky bottom-0 z-10 flex flex-row-reverse items-center gap-2 border-t border-border bg-card px-6 py-4',
      className,
    )}
    {...props}
  />
);
DrawerFooter.displayName = 'DrawerFooter';

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-heading-sm font-display font-medium leading-tight tracking-tight text-charcoal-primary',
      className,
    )}
    {...props}
  />
));
DrawerTitle.displayName = 'DrawerTitle';

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-caption text-muted-foreground', className)}
    {...props}
  />
));
DrawerDescription.displayName = 'DrawerDescription';

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
