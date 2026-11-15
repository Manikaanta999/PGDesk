import { useLanguage } from '../../context/LanguageContext';

interface LanguageSwitcherProps {
  compact?: boolean;
  className?: string;
}

export function LanguageSwitcher({ compact = false, className = '' }: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language selector"
      className={`inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800 ${className}`}
    >
      <button
        type="button"
        onClick={() => setLanguage('en')}
        aria-pressed={language === 'en'}
        className={`rounded-md font-medium whitespace-nowrap transition-colors ${
          compact ? 'px-1.5 py-1 text-[11px] sm:px-2 sm:text-xs' : 'px-2.5 py-1.5 text-xs sm:text-sm'
        } ${
          language === 'en'
            ? 'bg-white text-teal-800 shadow-xs dark:bg-slate-900 dark:text-teal-300'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
        }`}
      >
        English
      </button>
      <span aria-hidden="true" className="px-0.5 text-xs text-slate-300 dark:text-slate-600">
        |
      </span>
      <button
        type="button"
        onClick={() => setLanguage('te')}
        aria-pressed={language === 'te'}
        className={`rounded-md font-medium whitespace-nowrap transition-colors ${
          compact ? 'px-1.5 py-1 text-[11px] sm:px-2 sm:text-xs' : 'px-2.5 py-1.5 text-xs sm:text-sm'
        } ${
          language === 'te'
            ? 'bg-white text-teal-800 shadow-xs dark:bg-slate-900 dark:text-teal-300'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
        }`}
      >
        తెలుగు
      </button>
    </div>
  );
}
