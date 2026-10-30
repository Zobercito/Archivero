import { ExternalLink, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { DEMO_MODE, DEMO_PUBLIC_TOKEN } from '../lib/demo';

export function DemoBanner({ showLink = false }: { showLink?: boolean }) {
  const { t } = useI18n();
  if (!DEMO_MODE) return null;

  return (
    <div className="mb-6 flex flex-col gap-3 border border-dashed border-terracotta/40 bg-terracotta-soft/40 px-4 py-3 text-xs leading-relaxed text-ink-soft sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2.5">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-terracotta" aria-hidden />
        <span>
          <strong className="font-semibold text-terracotta-dark">{t('demo.bannerTitle')}</strong>{' '}
          {t('demo.bannerBody')}
        </span>
      </p>
      {showLink && (
        <Link
          to={`/s/${DEMO_PUBLIC_TOKEN}`}
          className="inline-flex shrink-0 items-center gap-1.5 border border-terracotta/40 bg-paper-light px-2.5 py-1.5 text-[0.68rem] font-semibold text-terracotta-dark transition hover:border-terracotta hover:bg-terracotta-soft"
        >
          {t('demo.sampleLink')}
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      )}
    </div>
  );
}
