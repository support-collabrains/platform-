// portal/components/ui/button.tsx
import { type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  title?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary:   'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold',
  secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600',
  ghost:     'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
  danger:    'bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-900/50',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-xl',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-sm rounded-2xl',
};

export function Button({ children, onClick, variant = 'secondary', size = 'md', disabled, type = 'button', className = '', title }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}
