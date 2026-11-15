import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  type HeadingTranslationKey,
  type LanguageCode,
  readStoredLanguage,
  resolveInitialLanguage,
  shouldShowLanguagePrompt,
  translateHeading,
  writeStoredLanguage,
} from '../lib/i18n';

interface LanguageContextValue {
  language: LanguageCode;
  showPrompt: boolean;
  setLanguage: (lang: LanguageCode) => void;
  dismissPrompt: () => void;
  tHeading: (key: HeadingTranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  showPrompt: false,
  setLanguage: () => {},
  dismissPrompt: () => {},
  tHeading: (key) => translateHeading('en', key),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [showPrompt, setShowPrompt] = useState(false);

  // Hydrate preference safely on mount so SSR/CSR initial output always matches cleanly
  useEffect(() => {
    const stored = readStoredLanguage();
    const resolved = resolveInitialLanguage(stored);
    setLanguageState(resolved);
    setShowPrompt(shouldShowLanguagePrompt(stored));
    document.documentElement.lang = resolved;
  }, []);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    writeStoredLanguage(lang);
    setShowPrompt(false);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, []);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    // Persist the default 'en' preference so the first-time notification does not reappear on future visits
    if (readStoredLanguage() === null) {
      writeStoredLanguage('en');
    }
  }, []);

  const tHeading = useCallback(
    (key: HeadingTranslationKey) => translateHeading(language, key),
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, showPrompt, setLanguage, dismissPrompt, tHeading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
