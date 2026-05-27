// portal/app/dashboard/LangContext.tsx
'use client';

import { createContext, useContext } from 'react';
import { translations, type Lang, type T } from './lang';

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const LangContext = createContext<LangContextValue>({
  lang: 'nl',
  setLang: () => {},
});

export function useT(): T {
  const { lang } = useContext(LangContext);
  return translations[lang] ?? translations.nl;
}

export function useLang(): [Lang, (l: Lang) => void] {
  const { lang, setLang } = useContext(LangContext);
  return [lang, setLang];
}
