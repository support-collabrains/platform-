'use client';

import { usePathname } from 'next/navigation';
import { Sun, Moon, Bell } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useDarkMode } from '@/hooks/use-dark-mode';
import Link from 'next/link';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':           'Overzicht',
  '/dashboard/tasks':     'Taken',
  '/dashboard/mail':      'Mail',
  '/dashboard/docs':      'Documenten',
  '/dashboard/photos':    "Foto's",
  '/dashboard/calendar':  'Agenda',
  '/dashboard/contacts':  'Contacten',
  '/dashboard/assistant': 'AI Assistent',
  '/dashboard/profile':   'Profiel',
  '/dashboard/admin':     'Beheer',
};

interface Props { username: string; }

export default function Header({ username }: Props) {
  const pathname = usePathname();
  const { dark, toggle } = useDarkMode();
  const title = PAGE_TITLES[pathname] ?? PAGE_TITLES[Object.keys(PAGE_TITLES).find(k => k !== '/dashboard' && pathname.startsWith(k)) ?? ''] ?? 'Diggi Cloud';

  return (
    <header
      className="hidden md:flex shrink-0 h-13 items-center px-6 gap-4"
      style={{ background: 'var(--dc-surface)', borderBottom: '1px solid var(--dc-border)', height: '52px' }}
    >
      <h1 className="flex-1 text-sm font-semibold text-slate-200">{title}</h1>

      <button
        onClick={toggle}
        className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition"
        title={dark ? 'Licht thema' : 'Donker thema'}
      >
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      <Link href="/dashboard/profile">
        <Avatar name={username} size="sm" />
      </Link>
    </header>
  );
}
