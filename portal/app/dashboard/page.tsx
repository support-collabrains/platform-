import { headers } from 'next/headers';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'Gebruiker';
  const groups = hdrs.get('x-authentik-groups') ?? '';
  const isAdmin = groups.split(',').map(g => g.trim()).includes('platform-admins');
  return <DashboardClient username={username} isAdmin={isAdmin} />;
}
