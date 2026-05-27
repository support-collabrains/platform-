// portal/app/dashboard/AppShell.tsx
'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, Mail, FileText, User } from 'lucide-react';
import { LangContext } from './LangContext';
import { translations, type Lang } from './lang';

interface Props {
  children: React.ReactNode;
  username: string;
  isAdmin: boolean;
}

const NAV_HREFS = [
  { href: '/dashboard', icon: Home },
  { href: '/dashboard/mail', icon: Mail },
  { href: '/dashboard/docs', icon: FileText },
  { href: '/dashboard/profile', icon: User },
] as const;

export default function AppShell({ children, username }: Props) {
  const pathname = usePathname();
  const [unreadMail, setUnreadMail] = useState(0);
  const [lang, setLang] = useState<Lang>('nl');

  useEffect(() => {
    fetch('/api/me/mail/stats')
      .then(r => r.ok ? r.json() : null)
      .then((d: { unread?: number } | null) => { if (d?.unread != null) setUnreadMail(d.unread); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/me/preferences')
      .then(r => r.ok ? r.json() : null)
      .then((d: { language?: string } | null) => {
        if (d?.language && ['nl', 'de', 'en'].includes(d.language)) setLang(d.language as Lang);
      })
      .catch(() => {});
  }, []);

  const t = translations[lang] ?? translations.nl;

  const PAGE_TITLES: Record<string, string> = {
    '/dashboard': t.titleHome,
    '/dashboard/mail': t.titleMail,
    '/dashboard/docs': t.titleDocs,
    '/dashboard/profile': t.titleProfile,
  };

  const NAV_LABELS = [t.navHome, t.navMail, t.navDocs, t.navProfile];

  const title = PAGE_TITLES[pathname] ?? t.titleFallback;

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <div className="flex flex-col bg-slate-900 text-slate-100 h-dvh">
        {/* Compact header */}
        <header className="shrink-0 h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-10">
          <span className="font-semibold text-sm text-slate-100">{title}</span>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-slate-900 font-bold text-sm select-none">
            {username.charAt(0).toUpperCase()}
          </div>
        </header>

        {/* Scrollable / controlled content area */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {children}
        </main>

        {/* Bottom navigation */}
        <nav className="shrink-0 bg-slate-900 border-t border-slate-800 flex">
          {NAV_HREFS.map(({ href, icon: Icon }, i) => {
            const label = NAV_LABELS[i];
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative transition-colors min-h-[56px] ${
                  active ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-cyan-400 rounded-full" />
                )}
                <div className="relative">
                  <Icon size={22} strokeWidth={active ? 2 : 1.5} />
                  {href === '/dashboard/mail' && unreadMail > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none">
                      {unreadMail > 99 ? '99+' : unreadMail}
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
