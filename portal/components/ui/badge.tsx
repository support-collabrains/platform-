// portal/components/ui/badge.tsx
import { type ReactNode } from 'react';

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'cyan';

const STYLES: Record<Variant, string> = {
  default:  'bg-slate-700 text-slate-300',
  success:  'bg-emerald-900/40 text-emerald-400',
  warning:  'bg-amber-900/40 text-amber-400',
  error:    'bg-red-900/40 text-red-400',
  info:     'bg-blue-900/40 text-blue-400',
  cyan:     'bg-cyan-500/20 text-cyan-300',
};

interface BadgeProps {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[variant]} ${className}`}>
      {children}
    </span>
  );
}
