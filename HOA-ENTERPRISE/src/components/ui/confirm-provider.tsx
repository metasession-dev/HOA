'use client';

import * as React from 'react';
import { AlertDialog } from './alert-dialog';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /**
   * Optional async work to run while the dialog stays open. The dialog's
   * confirm button shows a "Working…" spinner until this promise settles —
   * use this for delete/update mutations so the user has a clear visual
   * signal that something is happening. If the action throws, the dialog
   * stays open and the caller sees the exception.
   *
   * If omitted, confirm() resolves to true/false synchronously and the
   * caller is responsible for any loading UX (legacy pattern).
   */
  action?: () => Promise<void>;
};

type Resolver = (value: boolean) => void;

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<Resolver | null>(null);
  const actionRef = React.useRef<(() => Promise<void>) | null>(null);

  const confirm = React.useCallback<ConfirmContextValue>((opts) => {
    setOptions(opts);
    setOpen(true);
    actionRef.current = opts.action ?? null;
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  /**
   * When `action` is provided, AlertDialog awaits this function and shows the
   * spinner the whole time. We run the caller's mutation here so the spinner
   * is visible during the actual API call — not just the user's "yes" click.
   * Errors propagate to AlertDialog which keeps the dialog open so the user
   * can retry without losing the modal.
   */
  const handleConfirm = async () => {
    if (actionRef.current) {
      await actionRef.current();
    }
    resolverRef.current?.(true);
    resolverRef.current = null;
    actionRef.current = null;
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Treat any close that isn't a confirm() as cancel
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
      actionRef.current = null;
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <AlertDialog
          open={open}
          onOpenChange={handleOpenChange}
          title={options.title}
          description={options.description}
          confirmText={options.confirmText}
          cancelText={options.cancelText}
          destructive={options.destructive}
          onConfirm={handleConfirm}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return ctx;
}
