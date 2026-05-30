// portal/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Mail, FileText, User, CheckSquare, Calendar, Camera, LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';

interface Props {
  username: string;
  unreadMail: number;
  openTasks: number;
  logoutUrl: string;
}

const NAV_ITEMS = [
  { href: '/dashboard',          icon: Home,        label: 'Home' },
  { href: '/dashboard/tasks',    icon: CheckSquare, label: 'Taken',       badge: 'tasks' as const },
  { href: '/dashboard/mail',     icon: Mail,        label: 'Mail',        badge: 'mail' as const },
  { href: '/dashboard/docs',     icon: FileText,    label: 'Documenten' },
  { href: '/dashboard/photos',   icon: Camera,      label: "Foto's" },
  { href: '/dashboard/calendar', icon: Calendar,    label: 'Agenda' },
  { href: '/dashboard/profile',  icon: User,        label: 'Profiel' },
];

export default function Sidebar({ username, unreadMail, openTasks, logoutUrl }: Props) {
  const pathname = usePathname();

  function badgeCount(key: string): number | null {
    if (key === 'mail' && unreadMail > 0)  return unreadMail;
    if (key === 'tasks' && openTasks > 0)  return openTasks;
    return null;
  }

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-slate-900 border-r border-slate-800 h-full">
      {/* Logo */}
      <div className="shrink-0 px-5 py-5 border-b border-slate-800">
        <span className="font-bold text-slate-100 text-base tracking-tight">CollaBrains</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label, badge: badgeKey }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          const count = badgeKey ? badgeCount(badgeKey) : null;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                active
                  ? 'bg-cyan-500/15 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.5} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {count !== null && (
                <span className={`text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${
                  badgeKey === 'mail' ? 'bg-red-500 text-white' : 'bg-cyan-500 text-slate-900'
                }`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-slate-800 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={username} size="sm" />
          <span className="flex-1 text-sm text-slate-300 truncate">{username}</span>
          <a
            href={logoutUrl}
            className="p-1.5 text-slate-600 hover:text-red-400 transition rounded-lg hover:bg-slate-800"
            title="Uitloggen"
          >
            <LogOut size={14} />
          </a>
        </div>
      </div>
    </aside>
  );
}
