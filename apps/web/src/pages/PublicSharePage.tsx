import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Link2Off, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { FileIcon } from '../components/FileIcon';
import { LanguageToggle } from '../components/LanguageToggle';
import { Logo } from '../components/Logo';
import { Badge, Button, Spinner } from '../components/ui';
import { useToast } from '../context/toast';
import { useI18n } from '../i18n';
import { ApiError, api, unwrap } from '../lib/api';
import { saveUrl } from '../lib/download';
import { errorText } from '../lib/errors';
import { formatBytes, formatDate } from '../lib/format';
import type { PublicShare } from '../lib/types';

export function PublicSharePage() {
  const { token = '' } = useParams<{ token: string }>();
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const shareQuery = useQuery<PublicShare>({
    queryKey: ['public-share', token],
    queryFn: async () => {
      const response = await api.api.public.shares[':token'].$get({
        param: { token },
      });
      return (await unwrap(response)).share;
    },
    enabled: Boolean(token),
    retry: false,
  });

  const downloadMutation = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.api.public.shares[':token'].download.$post({
          param: { token },
        }),
      ),
    onSuccess: (result) => {
      saveUrl(result.url);
      notify(t('public.downloadStarted'), 'success');
      if (result.remainingDownloads === 0) {
        notify(t('public.lastDownload'), 'info');
      }
      queryClient.setQueryData<PublicShare>(['public-share', token], (current) =>
        current
          ? {
              ...current,
              downloadCount: current.downloadCount + 1,
              remainingDownloads: result.remainingDownloads,
            }
          : current,
      );
    },
    onError: (cause) => notify(errorText(t, cause), 'error'),
  });

  const share = shareQuery.data;
  const unavailable =
    shareQuery.isError && shareQuery.error instanceof ApiError && shareQuery.error.status === 404;
  const exhausted = share?.remainingDownloads === 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-rule/80 px-5 py-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="size-7 text-ink" />
          <span className="display text-lg">Archivero</span>
        </Link>
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:py-16">
        {shareQuery.isLoading ? (
          <div className="flex flex-col items-center gap-3 text-sm text-ink-soft">
            <Spinner className="size-5 text-terracotta" />
            {t('public.loading')}
          </div>
        ) : unavailable ? (
          <div className="w-full max-w-md border border-rule bg-paper-light px-7 py-10 text-center shadow-[0_30px_70px_-50px_rgba(28,25,23,.55)]">
            <span className="mx-auto mb-5 flex size-14 items-center justify-center border border-rule bg-paper text-ink-soft">
              <Link2Off className="size-6" aria-hidden />
            </span>
            <p className="eyebrow">{t('public.eyebrow')}</p>
            <h1 className="display mt-2 text-3xl">{t('public.unavailableTitle')}</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {t('public.unavailableBody')}
            </p>
            <Link
              to="/"
              className="mt-7 inline-flex border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition hover:border-terracotta-dark hover:bg-terracotta-dark"
            >
              {t('public.backHome')}
            </Link>
          </div>
        ) : shareQuery.isError || !share ? (
          <div className="w-full max-w-md border border-rule bg-paper-light px-7 py-10 text-center">
            <h1 className="display text-2xl">{t('public.error')}</h1>
            <Button variant="secondary" className="mt-5" onClick={() => void shareQuery.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <article className="w-full max-w-xl border border-rule bg-paper-light shadow-[0_35px_80px_-55px_rgba(28,25,23,.65)]">
            <div className="border-b border-rule px-6 py-5 sm:px-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">{t('public.eyebrow')}</p>
                  <p className="mt-1 text-[0.68rem] uppercase tracking-[0.18em] text-ink-faint">
                    {t('public.title')}
                  </p>
                </div>
                <span className="stamp px-3 py-1.5 text-[0.55rem]">Archivero</span>
              </div>
            </div>

            <div className="px-6 py-7 sm:px-8">
              <div className="flex items-start gap-4">
                <FileIcon name={share.fileName} mimeType={share.mimeType} size="lg" />
                <div className="min-w-0">
                  <h1 className="display break-words text-2xl leading-tight sm:text-3xl">
                    {share.fileName}
                  </h1>
                  <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                    {t('public.privacy')}
                  </p>
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-rule py-4 sm:grid-cols-3">
                <div>
                  <dt className="eyebrow text-[0.55rem] text-ink-faint">{t('public.size')}</dt>
                  <dd className="mt-1 text-sm font-semibold text-ink">
                    {formatBytes(share.size, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow text-[0.55rem] text-ink-faint">{t('public.version')}</dt>
                  <dd className="mt-1 text-sm font-semibold text-ink">v{share.versionNumber}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-[0.55rem] text-ink-faint">{t('public.sharedAt')}</dt>
                  <dd className="mt-1 text-sm font-semibold text-ink">
                    {formatDate(share.sharedAt, locale)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge tone={exhausted ? 'danger' : 'success'}>
                  {share.remainingDownloads === null
                    ? t('public.unlimited')
                    : t('public.downloadsLeft', { count: share.remainingDownloads })}
                </Badge>
                {share.expiresAt && (
                  <Badge tone="accent">
                    {t('public.expires', {
                      date: formatDate(share.expiresAt, locale, true),
                    })}
                  </Badge>
                )}
              </div>

              {exhausted ? (
                <p className="mt-5 border border-rule border-l-4 border-l-danger bg-danger-soft px-3 py-2.5 text-xs leading-relaxed text-danger">
                  {t('public.lastDownload')}
                </p>
              ) : (
                <Button
                  className="mt-5 w-full py-3 uppercase tracking-[0.16em]"
                  loading={downloadMutation.isPending}
                  onClick={() => downloadMutation.mutate()}
                >
                  <Download className="size-4" aria-hidden />
                  {downloadMutation.isPending ? t('public.downloading') : t('public.download')}
                </Button>
              )}

              <div className="mt-4 flex items-start gap-2 text-[0.68rem] leading-relaxed text-ink-faint">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <p>{t('public.secureNote')}</p>
              </div>
            </div>
          </article>
        )}
      </main>

      <footer className="border-t border-rule/80 px-5 py-4 text-center text-[0.62rem] uppercase tracking-[0.2em] text-ink-faint sm:px-8">
        {t('public.footer')} · {t('app.footer')}
      </footer>
    </div>
  );
}
