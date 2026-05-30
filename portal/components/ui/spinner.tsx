// portal/components/ui/spinner.tsx
type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
};

export function Spinner({ size = 'md', className = '' }: { size?: Size; className?: string }) {
  return (
    <div
      className={`rounded-full border-slate-600 border-t-current animate-spin ${SIZES[size]} ${className}`}
      role="status"
      aria-label="Laden"
    />
  );
}
