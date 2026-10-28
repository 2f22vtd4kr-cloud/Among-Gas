import { useEffect, useState } from 'react';

export type AppLanguage = 'ru' | 'en';

const STORAGE_KEY = 'amongGas.language';
const CHANGE_EVENT = 'among-gas-language-change';

export function getLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'ru';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
}

export function setLanguage(language: AppLanguage): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage can be disabled in private WebViews; in-memory event still updates mounted UI.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Shared persisted language preference for the lobby, gameplay and task panels. */
export function useLanguage(): { language: AppLanguage; setLanguage: (language: AppLanguage) => void } {
  const [language, setCurrentLanguage] = useState<AppLanguage>(getLanguage);

  useEffect(() => {
    const sync = () => setCurrentLanguage(getLanguage());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return { language, setLanguage };
}
