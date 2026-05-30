// portal/components/ui/toast.tsx
'use client';

import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

// ── Module-level store (client-side only) ─────────────────────────────────────
let _toasts: Toast[] = [];
let _listeners: Array<(toasts: Toast[]) => void> = [];

function notify() {
  _listeners.forEach(fn => fn([..._toasts]));
}

function add(message: string, variant: ToastVariant, durationMs: number) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  _toasts = [..._toasts.slice(-3), { id, message, variant }]; // max 4
  notify();
  setTimeout(() => remove(id), durationMs);
}

function remove(id: string) {
  _toasts = _toasts.filter(t => t.id !== id);
  notify();
}

// ── Public API ────────────────────────────────────────────────────────────────
export const toast = {
  success: (msg: string) => add(msg, 'success', 3000),
  error:   (msg: string) => add(msg, 'error',   6000),
  warning: (msg: string) => add(msg, 'warning', 5000),
  info:    (msg: string) => add(msg, 'info',    4000),
};

// ── Toaster component — mount once in layout ──────────────────────────────────
const ICONS: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
};

const STYLES: Record<ToastVariant, string> = {
  success: 'bg-emerald-900/90 border-emerald-700/60 text-emerald-200',
  error:   'bg-red-900/90 border-red-700/60 text-red-200',
  warning: 'bg-amber-900/90 border-amber-700/60 text-amber-200',
  info:    'bg-blue-900/90 border-blue-700/60 text-blue-200',
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const fn = (ts: Toast[]) => setToasts(ts);
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[calc(100vw-32px)] max-w-sm pointer-events-none"
    >
      {toasts.map(t => {
        const Icon = ICONS[t.variant];
        return (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl border text-sm shadow-lg backdrop-blur-sm ${STYLES[t.variant]}`}
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition"
              aria-label="Sluit melding"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
