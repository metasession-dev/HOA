'use client';

// Lightweight toast store inspired by shadcn-ui's reducer pattern.
// Reduced to the surface this app needs: title, description, variant, duration.

import * as React from 'react';
import type { ToastProps } from './toast';

type ToastVariant = NonNullable<ToastProps['variant']>;

type ToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  duration?: number;
};

type ToastRecord = ToastInput & { id: string; open: boolean };

const TOAST_LIMIT = 4;
const DEFAULT_DURATION = 4500;

type State = { toasts: ToastRecord[] };
type Listener = (state: State) => void;

const listeners: Listener[] = [];
let memoryState: State = { toasts: [] };

function setState(updater: (s: State) => State) {
  memoryState = updater(memoryState);
  listeners.forEach((l) => l(memoryState));
}

let counter = 0;
function nextId() {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now()}-${counter}`;
}

export function toast(input: ToastInput) {
  const id = nextId();
  const record: ToastRecord = { ...input, id, open: true };
  setState((s) => ({ toasts: [record, ...s.toasts].slice(0, TOAST_LIMIT) }));
  return {
    id,
    dismiss: () => dismissToast(id),
    update: (next: ToastInput) =>
      setState((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...next } : t)) })),
  };
}

export function dismissToast(id?: string) {
  setState((s) => ({
    toasts: s.toasts.map((t) => (!id || t.id === id ? { ...t, open: false } : t)),
  }));
}

function removeToast(id: string) {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function useToast() {
  const [state, set] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(set);
    return () => {
      const idx = listeners.indexOf(set);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);
  return {
    toasts: state.toasts,
    toast,
    dismiss: dismissToast,
    remove: removeToast,
    defaultDuration: DEFAULT_DURATION,
  };
}
