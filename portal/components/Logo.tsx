'use client';

interface Props { size?: 'sm' | 'md' | 'lg'; showText?: boolean; className?: string; }

export default function Logo({ size = 'md', showText = true, className = '' }: Props) {
  const iconSize = size === 'sm' ? 22 : size === 'lg' ? 36 : 28;
  const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="dc-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3b82f6"/>
            <stop offset="100%" stopColor="#06b6d4"/>
          </linearGradient>
        </defs>
        <path d="M26 14.5a6 6 0 0 0-5.5-6A8 8 0 0 0 5 13a5 5 0 0 0 1 9.9h20a4.5 4.5 0 0 0 0-9z" fill="url(#dc-grad)" opacity="0.9"/>
        <circle cx="16" cy="22" r="2.5" fill="#06b6d4" opacity="0.7"/>
        <path d="M16 22v5M13 27h6" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      </svg>
      {showText && (
        <span className={`font-bold tracking-tight text-slate-100 ${textSize}`}>
          Diggi <span className="text-blue-400">Cloud</span>
        </span>
      )}
    </div>
  );
}
