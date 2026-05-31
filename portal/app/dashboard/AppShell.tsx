'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, Mail, FileText, Bot, Calendar, Camera, BookUser, CheckSquare, User, Shield } from 'lucide-react';
import { LangContext } from './LangContext';
import { translations, type Lang } from './lang';
import { useApiRequest } from '@/hooks/use-api-request';
import Logo from '@/components/Logo';

interface Props {
  children: React.ReactNode;
  username: string;
  isAdmin: boolean;
}

// Primary 5 nav items for bottom bar; rest accessible from menu
const BOTTOM_NAV = [
  { href: '/dashboard',           icon: Home,     label: 'Home' },
  { href: '/dashboard/docs',      icon: FileText, label: 'Docs' },
  { href: '/dashboard/mail',      icon: Mail,     label: 'Mail',   badge: 'mail' as const },
  { href: '/dashboard/assistant', icon: Bot,      label: 'AI' },
  { href: '/dashboard/profile',   icon: User,     label: 'Profiel' },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':           'Overzicht',
  '/dashboard/docs':      'Documenten',
  '/dashboard/mail':      'Mail',
  '/dashboard/photos':    "Foto's",
  '/dashboard/calendar':  'Agenda',
  '/dashboard/contacts':  'Contacten',
  '/dashboard/tasks':     'Taken',
  '/dashboard/finance':   'Financiën',
  '/dashboard/assistant': 'AI Assistent',
  '/dashboard/profile':   'Profiel',
  '/dashboard/admin':     'Beheer',
};

export default function AppShell({ children, username, isAdmin }: Props) {
  const pathname = usePathname();
  const [unreadMail, setUnreadMail] = useState(0);
  const [lang, setLang] = useState<Lang>('nl');
  const { request } = useApiRequest();

  useEffect(() => {
    request<{ unread?: number }>('/api/me/mail/stats')
      .then(d => { if (d?.unread != null) setUnreadMail(d.unread); })
      .catch(() => {});
    request<{ language?: string }>('/api/me/preferences')
      .then(d => {
        if (d?.language && ['nl','de','en'].includes(d.language as string)) setLang(d.language as Lang);
      })
      .catch(() => {});
  }, [request]);

  const t = translations[lang] ?? translations.nl;
  const title = PAGE_TITLES[pathname] ?? PAGE_TITLES[Object.keys(PAGE_TITLES).find(k => k !== '/dashboard' && pathname.startsWith(k)) ?? ''] ?? 'Diggi Cloud';

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <div className="flex flex-col h-screen" style={{ background: 'var(--dc-bg)' }}>
        {/* Mobile top bar */}
        <header className="shrink-0 h-12 flex items-center px-4 gap-3"
          style={{ background: 'var(--dc-surface)', borderBottom: '1px solid var(--dc-border)' }}>
          <Logo size="sm" showText={false} />
          <h1 className="flex-1 text-sm font-semibold text-slate-200">{title}</h1>
          {isAdmin && (
            <Link href="/dashboard/admin" className="p-1.5 text-slate-500 hover:text-orange-400 transition">
              <Shield size={16} />
            </Link>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden">{children}</main>

        {/* Bottom nav */}
        <nav className="shrink-0 flex" style={{ background: 'var(--dc-surface)', borderTop: '1px solid var(--dc-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {BOTTOM_NAV.map(({ href, icon: Icon, label, badge: bKey }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            const count = bKey === 'mail' ? unreadMail : 0;
            return (
              <Link key={href} href={href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-all relative ${
                  active ? 'text-blue-400' : 'text-slate-500'
                }`}>
                <div className="relative">
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.5} />
                  {count > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold flex items-center justify-center rounded-full">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </LangContext.Provider>
  );
}
