// portal/app/dashboard/layout.tsx
import { headers } from 'next/headers';
import AppShell from './AppShell';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { Toaster } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'user';
  const groups = hdrs.get('x-authentik-groups') ?? '';
  const isAdmin = groups.split(',').map(g => g.trim()).includes('platform-admins');
  const logoutUrl = process.env.NEXT_PUBLIC_LOGOUT_URL ?? '/outpost.goauthentik.io/sign_out';

  return (
    <>
      {/* ── Desktop layout (≥ md) ──────────────────────────────────────────── */}
      <div className="hidden md:flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
        <Sidebar username={username} unreadMail={0} openTasks={0} logoutUrl={logoutUrl} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header username={username} />
          <main className="flex-1 overflow-y-auto p-6">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {/* ── Mobile layout (< md) — AppShell with bottom nav ───────────────── */}
      <div className="md:hidden">
        <AppShell username={username} isAdmin={isAdmin}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </AppShell>
      </div>

      <Toaster />
    </>
  );
}
