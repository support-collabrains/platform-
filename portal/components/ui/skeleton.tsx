// portal/components/ui/skeleton.tsx
type Variant = 'text' | 'block' | 'circle';

interface SkeletonProps {
  variant?: Variant;
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ variant = 'text', width, height, className = '' }: SkeletonProps) {
  const base = 'animate-pulse bg-slate-700';
  const shape = variant === 'circle' ? 'rounded-full' : variant === 'text' ? 'rounded h-3' : 'rounded-xl';
  return (
    <div
      className={`${base} ${shape} ${className}`}
      style={{ width, height }}
    />
  );
}
