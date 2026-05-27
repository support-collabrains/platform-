import { headers } from 'next/headers';
import HomeTab from './HomeTab';

export default async function DashboardPage() {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'Gebruiker';
  return <HomeTab username={username} />;
}
