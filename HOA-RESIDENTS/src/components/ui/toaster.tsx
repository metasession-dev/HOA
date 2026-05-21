'use client';

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast';
import { useToast } from './use-toast';

export function Toaster() {
  const { toasts, remove, defaultDuration } = useToast();

  return (
    <ToastProvider swipeDirection="right" duration={defaultDuration}>
      {toasts.map(({ id, title, description, variant, open, duration }) => (
        <Toast
          key={id}
          variant={variant}
          open={open}
          duration={duration ?? defaultDuration}
          onOpenChange={(o) => {
            if (!o) {
              // Wait for close animation before removing from state
              setTimeout(() => remove(id), 200);
            }
          }}
        >
          <div className="flex-1 min-w-0">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
