import { headers } from 'next/headers';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'Gebruiker';
  return <DashboardClient username={username} />;
}
