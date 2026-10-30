import { ArchiveX } from 'lucide-react';
import { BrowserRouter, Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useI18n } from '../i18n';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-md border border-rule bg-paper-light px-8 py-12 text-center shadow-[0_30px_70px_-50px_rgba(28,25,23,.5)]">
        <span className="mx-auto mb-5 flex size-14 items-center justify-center border border-rule bg-paper text-ink-soft">
          <ArchiveX className="size-6" aria-hidden />
        </span>
        <p className="eyebrow">404</p>
        <h1 className="display mt-2 text-3xl">{t('notFound.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{t('notFound.body')}</p>
        <Link
          to="/"
          className="mt-7 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition hover:border-terracotta-dark hover:bg-terracotta-dark"
        >
          <Logo className="size-4" />
          {t('notFound.back')}
        </Link>
      </div>
    </div>
  );
}
