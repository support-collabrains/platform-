'use client';

import { useTransition, useState } from 'react';

const LANGUAGES = [
  { value: 'nl', label: '🇳🇱 Nederlands' },
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'en', label: '🇬🇧 English' },
] as const;

type Lang = 'nl' | 'de' | 'en';

export default function LanguageSelector({ initialValue }: { initialValue: Lang }) {
  const [value, setValue] = useState<Lang>(initialValue);
  const [, startTransition] = useTransition();

  const handleChange = (lang: Lang) => {
    const prev = value;
    setValue(lang);
    startTransition(async () => {
      try {
        const res = await fetch('/api/me/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: lang }),
        });
        if (!res.ok) setValue(prev);
      } catch {
        setValue(prev);
      }
    });
  };

  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium text-slate-700">Taal / Sprache / Language</div>
        <div className="text-xs text-slate-400 mt-0.5">
          Taal voor Signal-berichten en het dashboard
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value as Lang)}
        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>
    </div>
  );
}
