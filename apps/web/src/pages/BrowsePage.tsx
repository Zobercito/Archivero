import { FolderOpen } from 'lucide-react';
import { useI18n } from '../i18n';

export function BrowsePage() {
  const { t } = useI18n();
  return (
    <div>
      <p className="eyebrow">{t('browse.rootEyebrow')}</p>
      <h1 className="display mt-2 text-4xl">{t('browse.rootTitle')}</h1>
      <div className="mt-8 flex items-center gap-3 border border-dashed border-rule-strong/70 bg-paper-light/60 px-5 py-10 text-sm text-ink-soft">
        <FolderOpen className="size-5 text-ink-faint" aria-hidden />
        {t('common.loading')}
      </div>
    </div>
  );
}
