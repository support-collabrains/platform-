// portal/components/layout/Header.tsx
'use client';

import { usePathname } from 'next/navigation';
import { Sun, Moon } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useDarkMode } from '@/hooks/use-dark-mode';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':           'Home',
  '/dashboard/tasks':     'Taken',
  '/dashboard/mail':      'Mail',
  '/dashboard/docs':      'Documenten',
  '/dashboard/photos':    "Foto's",
  '/dashboard/calendar':  'Agenda',
  '/dashboard/profile':   'Profiel',
};

interface Props {
  username: string;
}

export default function Header({ username }: Props) {
  const pathname = usePathname();
  const { dark, toggle } = useDarkMode();
  const title = PAGE_TITLES[pathname] ?? 'CollaBrains';

  return (
    <header className="hidden md:flex shrink-0 h-14 bg-slate-900 border-b border-slate-800 items-center px-6 gap-4">
      <h1 className="flex-1 text-sm font-semibold text-slate-200">{title}</h1>

      <button
        onClick={toggle}
        className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-xl transition"
        title={dark ? 'Licht thema' : 'Donker thema'}
        aria-label={dark ? 'Schakel naar licht thema' : 'Schakel naar donker thema'}
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <Avatar name={username} size="sm" />
    </header>
  );
}
