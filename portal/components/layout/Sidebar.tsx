'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Mail, FileText, User, CheckSquare, Calendar,
  Camera, Bot, BookUser, Shield, LogOut, ChevronRight, Euro,
} from 'lucide-react';
import Logo from '@/components/Logo';
import { Avatar } from '@/components/ui/avatar';

interface Props {
  username: string;
  unreadMail: number;
  openTasks: number;
  logoutUrl: string;
  isAdmin?: boolean;
}

const NAV = [
  { href: '/dashboard',           icon: Home,        label: 'Home' },
  { href: '/dashboard/docs',      icon: FileText,    label: 'Documenten' },
  { href: '/dashboard/mail',      icon: Mail,        label: 'Mail',       badge: 'mail' as const },
  { href: '/dashboard/photos',    icon: Camera,      label: "Foto's" },
  { href: '/dashboard/calendar',  icon: Calendar,    label: 'Agenda' },
  { href: '/dashboard/contacts',  icon: BookUser,    label: 'Contacten' },
  { href: '/dashboard/tasks',     icon: CheckSquare, label: 'Taken',      badge: 'tasks' as const },
  { href: '/dashboard/finance',   icon: Euro,        label: 'Financiën' },
  { href: '/dashboard/assistant', icon: Bot,         label: 'AI Assistent' },
  { href: '/dashboard/profile',   icon: User,        label: 'Profiel' },
];

export default function Sidebar({ username, unreadMail, openTasks, logoutUrl, isAdmin }: Props) {
  const pathname = usePathname();

  const badgeCount = (key: 'mail' | 'tasks') => key === 'mail' ? unreadMail : openTasks;

  return (
    <aside
      className="hidden md:flex w-56 shrink-0 flex-col h-full"
      style={{ background: 'var(--dc-surface)', borderRight: '1px solid var(--dc-border)' }}
    >
      <div className="shrink-0 px-4 py-4" style={{ borderBottom: '1px solid var(--dc-border)' }}>
        <Logo size="sm" />
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label, badge: bKey }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          const count = bKey ? badgeCount(bKey) : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                active
                  ? 'font-semibold text-blue-300 bg-blue-500/10'
                  : 'font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2.2 : 1.7} className="shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {count > 0 && (
                <span className={`text-[10px] font-bold min-w-[18px] h-4 flex items-center justify-center px-1 rounded-full ${
                  bKey === 'mail' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                }`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="mx-3 my-1.5" style={{ borderTop: '1px solid var(--dc-border)' }} />
            <Link
              href="/dashboard/admin"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                pathname.startsWith('/dashboard/admin')
                  ? 'text-orange-300 bg-orange-500/10'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              <Shield size={16} strokeWidth={1.7} className="shrink-0" />
              <span>Beheer</span>
            </Link>
          </>
        )}
      </nav>

      <div className="shrink-0 p-2" style={{ borderTop: '1px solid var(--dc-border)' }}>
        <a
          href={logoutUrl}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-white/5 transition"
        >
          <LogOut size={14} />
          <span>Uitloggen</span>
        </a>
      </div>
    </aside>
  );
}
