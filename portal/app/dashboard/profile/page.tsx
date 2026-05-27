// portal/app/dashboard/profile/page.tsx
import { headers } from 'next/headers';
import ProfileTab from './ProfileTab';

export default async function ProfilePage() {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'user';
  const email = hdrs.get('x-authentik-email') ?? '';
  const groups = hdrs.get('x-authentik-groups') ?? '';
  const isAdmin = groups.split(',').map(g => g.trim()).includes('platform-admins');
  return <ProfileTab username={username} email={email} isAdmin={isAdmin} />;
}
