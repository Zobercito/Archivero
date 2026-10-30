import { useI18n } from '../i18n';

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <fieldset
      className="m-0 inline-flex min-w-0 items-center border border-rule bg-paper-light/80 p-0.5"
      aria-label={t('language.label')}
    >
      <legend className="sr-only">{t('language.label')}</legend>
      {(['es', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={`px-2 py-1 text-[0.65rem] font-bold tracking-[0.16em] transition ${
            locale === code ? 'bg-ink text-paper' : 'text-ink-faint hover:text-ink'
          }`}
        >
          {t(code === 'es' ? 'language.es' : 'language.en')}
        </button>
      ))}
    </fieldset>
  );
}
