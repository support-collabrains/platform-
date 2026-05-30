// portal/app/dashboard/layout.tsx
import { headers } from 'next/headers';
import AppShell from './AppShell';
import { Toaster } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'user';
  const groups = hdrs.get('x-authentik-groups') ?? '';
  const isAdmin = groups.split(',').map(g => g.trim()).includes('platform-admins');
  return (
    <AppShell username={username} isAdmin={isAdmin}>
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
      <Toaster />
    </AppShell>
  );
}
