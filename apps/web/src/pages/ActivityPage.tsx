import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Download,
  FileCheck,
  FileClock,
  FilePen,
  FileX,
  FolderCheck,
  FolderPen,
  FolderPlus,
  FolderX,
  Link2Off,
  LogIn,
  type LucideIcon,
  ScrollText,
  Share2,
  Trash2,
  Upload,
  UserPen,
  UserPlus,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button, cn, EmptyState, Spinner } from '../components/ui';
import { es, type TranslationKey, useI18n } from '../i18n';
import { api, unwrap } from '../lib/api';
import { formatDate } from '../lib/format';

function iconFor(action: string): LucideIcon {
  if (action === 'session.login') return LogIn;
  if (action.startsWith('folder.')) {
    const map: Record<string, LucideIcon> = {
      'folder.create': FolderPlus,
      'folder.update': FolderPen,
      'folder.delete': FolderX,
      'folder.restore': FolderCheck,
      'folder.purge': Trash2,
    };
    return map[action] ?? FolderPen;
  }
  if (action === 'file.version.create' || action === 'file.version.restore') {
    return FileClock;
  }
  if (action.startsWith('file.')) {
    const map: Record<string, LucideIcon> = {
      'file.upload': Upload,
      'file.download': Download,
      'file.update': FilePen,
      'file.delete': FileX,
      'file.restore': FileCheck,
      'file.purge': Trash2,
    };
    return map[action] ?? FilePen;
  }
  if (action === 'share.create') return Share2;
  if (action === 'share.revoke') return Link2Off;
  if (action === 'share.download') return Download;
  if (action === 'user.create') return UserPlus;
  if (action === 'user.update') return UserPen;
  return ScrollText;
}

function toneFor(action: string) {
  if (action.endsWith('.purge') || action.endsWith('.delete') || action.endsWith('.revoke')) {
    return 'border-danger/30 bg-danger-soft text-danger';
  }
  if (action.endsWith('.create') || action.endsWith('.upload') || action.endsWith('.restore')) {
    return 'border-moss/30 bg-moss-soft text-moss';
  }
  return 'border-rule bg-paper text-ink-soft';
}

export function ActivityPage() {
  const { t, locale } = useI18n();

  const query = useInfiniteQuery({
    queryKey: ['activity'],
    queryFn: async ({ pageParam }) => {
      const response = await api.api.activity.$get({
        query: { limit: '30', offset: String(pageParam) },
      });
      return unwrap(response);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.nextOffset : undefined),
  });

  const entries = query.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <div className="animate-enter">
      <PageHeader
        eyebrow={t('shell.activity')}
        title={t('activity.title')}
        subtitle={t('activity.subtitle')}
      />

      {query.isError ? (
        <div className="mt-6 border border-danger/30 border-l-4 border-l-danger bg-danger-soft px-5 py-6">
          <p className="text-sm text-danger">{t('activity.error')}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void query.refetch()}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : query.isLoading ? (
        <div className="mt-6 flex items-center gap-3 border border-rule bg-paper-light px-5 py-10 text-sm text-ink-soft">
          <Spinner className="size-4 text-terracotta" />
          {t('common.loading')}
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<ScrollText className="size-5" aria-hidden />}
            title={t('activity.empty')}
            body={t('activity.subtitle')}
          />
        </div>
      ) : (
        <>
          <ol className="mt-6">
            {entries.map((entry, index) => {
              const Icon = iconFor(entry.action);
              const actionKey = `activity.action.${entry.action}` as TranslationKey;
              const targetKey = `activity.target.${entry.targetType}` as TranslationKey;
              const actionLabel = actionKey in es ? t(actionKey) : entry.action;
              const targetLabel = targetKey in es ? t(targetKey) : entry.targetType;
              const meta = entry.metadata ?? {};
              const subject =
                typeof meta.name === 'string'
                  ? meta.name
                  : typeof meta.previousName === 'string'
                    ? meta.previousName
                    : typeof meta.fileName === 'string'
                      ? meta.fileName
                      : typeof meta.email === 'string'
                        ? meta.email
                        : null;
              const version = typeof meta.version === 'number' ? `v${meta.version}` : null;

              return (
                <li
                  key={entry.id}
                  className={cn(
                    'flex gap-3 py-3',
                    index !== entries.length - 1 && 'border-b border-rule/80',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center border',
                      toneFor(entry.action),
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-sm text-ink">
                        <span className="font-semibold">{actionLabel}</span>
                        {subject && <span className="text-ink-soft"> · «{subject}»</span>}
                        {version && !subject && <span className="text-ink-soft"> · {version}</span>}
                      </p>
                      <time dateTime={entry.createdAt} className="text-[0.68rem] text-ink-faint">
                        {formatDate(entry.createdAt, locale, true)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      <span className="uppercase tracking-[0.12em]">{targetLabel}</span>
                      {' · '}
                      {entry.user
                        ? t('activity.by', { name: entry.user.name })
                        : t('activity.system')}
                      {entry.user?.email ? ` · ${entry.user.email}` : ''}
                      {version && subject ? ` · ${version}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {query.hasNextPage && (
            <div className="mt-5 flex justify-center">
              <Button
                variant="secondary"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {t('activity.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
