import { Settings } from 'lucide-react';
import PreferenceToggle from './PreferenceToggle';
import LanguageSelector from './LanguageSelector';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

interface UserPreferences {
  signal_doc_notify: boolean;
  signal_digest_mode: boolean;
  language: 'nl' | 'de' | 'en';
}

export default async function PreferencesPanel({ uid }: { uid: string }) {
  let prefs: UserPreferences = { signal_doc_notify: true, signal_digest_mode: false, language: 'nl' };
  try {
    const res = await fetch(`${INTERNAL_API_URL}/users/me/preferences`, {
      headers: { 'x-internal-secret': INTERNAL_API_SECRET, 'x-authentik-uid': uid },
      cache: 'no-store',
    });
    if (res.ok) prefs = await res.json() as UserPreferences;
  } catch { /* use defaults */ }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <Settings size={15} className="text-slate-400" /> Instellingen
      </h2>
      <div className="divide-y divide-slate-100">
        <div className="pb-3">
          <LanguageSelector initialValue={prefs.language} />
        </div>
        <div className="pt-3 space-y-3">
          <PreferenceToggle
            label="Signal-melding bij nieuw document"
            description="Ontvang een Signal-bericht zodra Paperless een nieuw document verwerkt."
            preferenceKey="signal_doc_notify"
            initialValue={prefs.signal_doc_notify}
          />
          <PreferenceToggle
            label="Digest-modus (dagelijks overzicht)"
            description="Ontvang één dagelijks Signal-bericht i.p.v. direct per document. Actief na subsysteem B."
            preferenceKey="signal_digest_mode"
            initialValue={prefs.signal_digest_mode}
            disabled
          />
        </div>
      </div>
    </section>
  );
}
