import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { LANGUAGE_PROMPT_COPY } from '../../lib/i18n';

export function LanguagePreferencePrompt() {
  const { showPrompt, setLanguage, dismissPrompt } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!showPrompt) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 120);
    return () => window.clearTimeout(timer);
  }, [showPrompt]);

  if (!showPrompt) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Language preference notification"
      className={`fixed bottom-4 left-4 right-4 z-40 sm:left-auto sm:right-5 sm:max-w-sm transition-all duration-300 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
    >
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 text-sm leading-snug text-slate-800 dark:text-slate-100">
            <p className="font-semibold">{LANGUAGE_PROMPT_COPY.line1}</p>
            <p className="text-slate-600 dark:text-slate-300">{LANGUAGE_PROMPT_COPY.line2}</p>
          </div>
          <button
            type="button"
            onClick={dismissPrompt}
            aria-label={LANGUAGE_PROMPT_COPY.closeLabel}
            className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {LANGUAGE_PROMPT_COPY.keepEnglish}
          </button>
          <button
            type="button"
            onClick={() => setLanguage('te')}
            className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
          >
            {LANGUAGE_PROMPT_COPY.useTelugu}
          </button>
        </div>
      </div>
    </aside>
  );
}
