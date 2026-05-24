import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';
const AUTHENTIK_EXTERNAL_URL = process.env.AUTHENTIK_EXTERNAL_URL ?? '';

interface UserProfile {
  username: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  totpEnabled: boolean;
}

export default async function ProfilePanel({ uid, groups }: { uid: string; groups: string }) {
  let profile: UserProfile | null = null;
  try {
    const res = await fetch(`${INTERNAL_API_URL}/users/me/profile`, {
      headers: {
        'x-internal-secret': INTERNAL_API_SECRET,
        'x-authentik-uid': uid,
        'x-authentik-groups': groups,
      },
      cache: 'no-store',
    });
    if (res.ok) profile = await res.json() as UserProfile;
  } catch { /* use null */ }

  if (!profile) return null;

  const mfaSetupUrl = AUTHENTIK_EXTERNAL_URL
    ? `${AUTHENTIK_EXTERNAL_URL}/if/user/#/settings;mfa`
    : null;

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <Shield size={15} className="text-slate-400" /> Profiel & beveiliging
      </h2>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">{profile.name || profile.username}</p>
            <p className="text-xs text-slate-400">{profile.email}</p>
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              profile.role === 'admin'
                ? 'bg-violet-100 text-violet-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {profile.role === 'admin' ? 'Beheerder' : 'Gebruiker'}
          </span>
        </div>

        <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {profile.totpEnabled ? (
              <ShieldCheck size={15} className="text-green-500" />
            ) : (
              <ShieldAlert size={15} className="text-amber-500" />
            )}
            <div>
              <p className="text-sm text-slate-700">Twee-staps verificatie</p>
              <p className={`text-xs ${profile.totpEnabled ? 'text-green-600' : 'text-amber-600'}`}>
                {profile.totpEnabled ? 'Ingeschakeld' : 'Niet ingeschakeld'}
              </p>
            </div>
          </div>
          {!profile.totpEnabled && mfaSetupUrl && (
            <a
              href={mfaSetupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Instellen
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
