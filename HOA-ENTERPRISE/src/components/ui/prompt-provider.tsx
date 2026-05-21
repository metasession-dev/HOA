'use client';

/**
 * Drop-in replacement for `window.prompt()` using a real dialog.
 *
 *   const prompt = usePrompt();
 *   const value = await prompt({
 *     title: 'Distribute equally across 12 months',
 *     message: 'Enter the annual total to spread evenly.',
 *     placeholder: '0.00',
 *     inputType: 'number',
 *     confirmText: 'Distribute',
 *   });
 *   if (value === null) return; // user cancelled
 *
 * The component is keyboard-friendly: Enter confirms, Esc cancels (Dialog
 * handles that), and the input is auto-focused.
 */
import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './dialog';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  inputType?: 'text' | 'number' | 'email' | 'tel';
  /** Optional validator — return null to accept, or an error string to reject. */
  validate?: (value: string) => string | null;
}

type Resolver = (value: string | null) => void;

const PromptContext = React.createContext<((opts: PromptOptions) => Promise<string | null>) | null>(null);

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<PromptOptions | null>(null);
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const resolverRef = React.useRef<Resolver | null>(null);

  const prompt = React.useCallback((opts: PromptOptions) => {
    setOptions(opts);
    setValue(opts.defaultValue ?? '');
    setError(null);
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (options?.validate) {
      const msg = options.validate(value);
      if (msg) {
        setError(msg);
        return;
      }
    }
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && resolverRef.current) {
      // Esc / overlay click — treat as cancel.
      resolverRef.current(null);
      resolverRef.current = null;
    }
  };

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      {options && (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{options.title}</DialogTitle>
                {options.message && <DialogDescription>{options.message}</DialogDescription>}
              </DialogHeader>
              <div className="space-y-1.5 py-2">
                <Label htmlFor="prompt-input" className="sr-only">{options.title}</Label>
                <Input
                  id="prompt-input"
                  type={options.inputType ?? 'text'}
                  placeholder={options.placeholder}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (error) setError(null);
                  }}
                  autoFocus
                />
                {error && <p className="text-caption text-coral-red">{error}</p>}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    {options.cancelText ?? 'Cancel'}
                  </Button>
                </DialogClose>
                <Button type="submit">{options.confirmText ?? 'OK'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </PromptContext.Provider>
  );
}

export function usePrompt() {
  const ctx = React.useContext(PromptContext);
  if (!ctx) throw new Error('usePrompt must be used within a PromptProvider');
  return ctx;
}
