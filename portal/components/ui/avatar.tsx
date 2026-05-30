// portal/components/ui/avatar.tsx
type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-14 h-14 text-2xl',
};

interface AvatarProps {
  name: string;
  size?: Size;
  className?: string;
}

export function Avatar({ name, size = 'md', className = '' }: AvatarProps) {
  return (
    <div className={`rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-slate-900 font-bold select-none shrink-0 ${SIZES[size]} ${className}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
