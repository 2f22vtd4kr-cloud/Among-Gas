import { useEffect, useState } from 'react';

export type AppLanguage = 'ru' | 'en';

const STORAGE_KEY = 'amongGas.language';
const CHANGE_EVENT = 'among-gas-language-change';

let inMemoryLanguage: AppLanguage = 'ru';
let initialized = false;

function readStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'ru';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
}

export function getLanguage(): AppLanguage {
  if (!initialized) {
    inMemoryLanguage = readStoredLanguage();
    initialized = true;
  }
  return inMemoryLanguage;
}

function refreshLanguageFromStorage(): void {
  inMemoryLanguage = readStoredLanguage();
  initialized = true;
}

export function setLanguage(language: AppLanguage): void {
  inMemoryLanguage = language;
  initialized = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The in-memory choice is still shared across mounted UI when storage is denied.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Shared language preference for the lobby, gameplay, and task panels. */
export function useLanguage(): { language: AppLanguage; setLanguage: (language: AppLanguage) => void } {
  const [language, setCurrentLanguage] = useState<AppLanguage>(getLanguage);

  useEffect(() => {
    const sync = () => {
      const next = getLanguage();
      setCurrentLanguage(next);
      document.documentElement.lang = next;
    };
    const syncExternalStorage = () => {
      refreshLanguageFromStorage();
      sync();
    };
    document.documentElement.lang = getLanguage();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', syncExternalStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', syncExternalStorage);
    };
  }, []);

  return { language, setLanguage };
}
