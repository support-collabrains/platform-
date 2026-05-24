'use client';

import { useState, useTransition } from 'react';

interface Props {
  label: string;
  description: string;
  preferenceKey: string;
  initialValue: boolean;
  disabled?: boolean;
}

export default function PreferenceToggle({ label, description, preferenceKey, initialValue, disabled }: Props) {
  const [value, setValue] = useState(initialValue);
  const [, startTransition] = useTransition();

  function handleChange(next: boolean) {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      try {
        const res = await fetch('/api/me/preferences', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [preferenceKey]: next }),
        });
        if (!res.ok) setValue(prev);
      } catch {
        setValue(prev);
      }
    });
  }

  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => !disabled && handleChange(!value)}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          value ? 'bg-blue-600' : 'bg-slate-200'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
