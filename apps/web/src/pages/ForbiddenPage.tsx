import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export function ForbiddenPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <div className="w-full max-w-md border border-rule bg-paper-light px-8 py-10 text-center">
        <span className="mx-auto mb-5 flex size-14 items-center justify-center border border-rule bg-paper text-ink-soft">
          <ShieldX className="size-6" aria-hidden />
        </span>
        <p className="eyebrow">403</p>
        <h1 className="display mt-2 text-3xl">{t('forbidden.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{t('forbidden.body')}</p>
        <Link
          to="/"
          className="mt-7 inline-flex border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition hover:border-terracotta-dark hover:bg-terracotta-dark"
        >
          {t('forbidden.back')}
        </Link>
      </div>
    </div>
  );
}
