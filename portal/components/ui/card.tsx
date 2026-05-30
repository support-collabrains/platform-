// portal/components/ui/card.tsx
import { type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  const base = 'bg-slate-800 dark:bg-slate-800 rounded-2xl border border-slate-700/50';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} w-full text-left transition hover:bg-slate-700/80 active:scale-[0.98] ${className}`}>
        {children}
      </button>
    );
  }
  return <div className={`${base} ${className}`}>{children}</div>;
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 pt-4 pb-2 border-b border-slate-700/50 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-xs font-semibold text-slate-500 uppercase tracking-wider ${className}`}>{children}</h3>;
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
