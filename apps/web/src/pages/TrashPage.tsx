import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Folder, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FileIcon } from '../components/FileIcon';
import { PageHeader } from '../components/PageHeader';
import { Button, EmptyState, Spinner } from '../components/ui';
import { useAuth } from '../context/auth';
import { useToast } from '../context/toast';
import { useI18n } from '../i18n';
import { api, unwrap } from '../lib/api';
import { errorText } from '../lib/errors';
import { formatBytes, formatDate, isAdmin } from '../lib/format';
import type { FileItem } from '../lib/types';

type TrashTarget = { type: 'folder' | 'file'; id: string; name: string };

export function TrashPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [purgeTarget, setPurgeTarget] = useState<TrashTarget | null>(null);

  const trashQuery = useQuery({
    queryKey: ['trash'],
    queryFn: async () => {
      const response = await api.api.trash.$get();
      return unwrap(response);
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['trash'] });
    void queryClient.invalidateQueries({ queryKey: ['folders'] });
    void queryClient.invalidateQueries({ queryKey: ['files'] });
  };

  const restoreMutation = useMutation({
    mutationFn: async (target: TrashTarget) =>
      unwrap(
        await api.api.trash[':type'][':id'].restore.$post({
          param: { type: target.type, id: target.id },
        }),
      ),
    onSuccess: () => {
      refresh();
      notify(t('trash.restored'), 'success');
    },
    onError: (cause) => notify(errorText(t, cause), 'error'),
  });

  const purgeMutation = useMutation({
    mutationFn: async (target: TrashTarget) =>
      unwrap(
        await api.api.trash[':type'][':id'].$delete({
          param: { type: target.type, id: target.id },
        }),
      ),
    onSuccess: () => {
      refresh();
      setPurgeTarget(null);
      notify(t('trash.purged'), 'success');
    },
    onError: (cause) => notify(errorText(t, cause), 'error'),
  });

  const data = trashQuery.data;
  const folders = data?.folders ?? [];
  const files = data?.files ?? [];
  const empty = folders.length === 0 && files.length === 0;
  const admin = isAdmin(user?.role);

  return (
    <div className="animate-enter">
      <PageHeader
        eyebrow={t('browse.breadcrumbHome')}
        title={t('trash.title')}
        subtitle={t('trash.subtitle')}
      />

      {!admin && (
        <div className="mt-5 flex items-start gap-2.5 border border-rule bg-paper-light/70 px-4 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
          <p className="text-xs leading-relaxed text-ink-soft">{t('trash.adminNote')}</p>
        </div>
      )}

      {trashQuery.isError ? (
        <div className="mt-6 border border-danger/30 border-l-4 border-l-danger bg-danger-soft px-5 py-6">
          <p className="text-sm text-danger">{t('trash.error')}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void trashQuery.refetch()}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : trashQuery.isLoading ? (
        <div className="mt-6 flex items-center gap-3 border border-rule bg-paper-light px-5 py-10 text-sm text-ink-soft">
          <Spinner className="size-4 text-terracotta" />
          {t('trash.loading')}
        </div>
      ) : empty ? (
        <div className="mt-6">
          <EmptyState
            icon={<Trash2 className="size-5" aria-hidden />}
            title={t('trash.emptyTitle')}
            body={t('trash.emptyBody')}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-7">
          {folders.length > 0 && (
            <section>
              <h2 className="eyebrow text-ink-faint">
                {t('trash.folders')}
                <span className="ml-2 font-sans text-[0.66rem] tracking-normal text-ink-faint/80">
                  {folders.length}
                </span>
              </h2>
              <ul className="mt-3 divide-y divide-rule border border-rule bg-paper-light">
                {folders.map((folder) => (
                  <TrashRow
                    key={folder.id}
                    name={folder.name}
                    meta={t('browse.folderMeta', {
                      date: formatDate(folder.createdAt, locale),
                    })}
                    icon={
                      <span className="flex size-9 shrink-0 items-center justify-center border border-rule bg-paper-deep/70 text-ink-soft">
                        <Folder className="size-4" aria-hidden />
                      </span>
                    }
                    restoring={
                      restoreMutation.isPending && restoreMutation.variables?.id === folder.id
                    }
                    purging={purgeMutation.isPending && purgeMutation.variables?.id === folder.id}
                    admin={admin}
                    onRestore={() =>
                      restoreMutation.mutate({
                        type: 'folder',
                        id: folder.id,
                        name: folder.name,
                      })
                    }
                    onPurge={() =>
                      setPurgeTarget({
                        type: 'folder',
                        id: folder.id,
                        name: folder.name,
                      })
                    }
                  />
                ))}
              </ul>
            </section>
          )}

          {files.length > 0 && (
            <section>
              <h2 className="eyebrow text-ink-faint">
                {t('trash.files')}
                <span className="ml-2 font-sans text-[0.66rem] tracking-normal text-ink-faint/80">
                  {files.length}
                </span>
              </h2>
              <ul className="mt-3 divide-y divide-rule border border-rule bg-paper-light">
                {files.map((file) => (
                  <TrashRow
                    key={file.id}
                    name={file.name}
                    meta={fileMeta(file, locale)}
                    icon={<FileIcon name={file.name} mimeType={file.mimeType} />}
                    restoring={
                      restoreMutation.isPending && restoreMutation.variables?.id === file.id
                    }
                    purging={purgeMutation.isPending && purgeMutation.variables?.id === file.id}
                    admin={admin}
                    onRestore={() =>
                      restoreMutation.mutate({
                        type: 'file',
                        id: file.id,
                        name: file.name,
                      })
                    }
                    onPurge={() =>
                      setPurgeTarget({
                        type: 'file',
                        id: file.id,
                        name: file.name,
                      })
                    }
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(purgeTarget)}
        title={t('trash.purgeTitle')}
        body={t(purgeTarget?.type === 'folder' ? 'trash.purgeFolderBody' : 'trash.purgeBody', {
          name: purgeTarget?.name ?? '',
        })}
        confirmLabel={t('trash.purge')}
        loading={purgeMutation.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => {
          if (purgeTarget) purgeMutation.mutate(purgeTarget);
        }}
      />
    </div>
  );
}

function fileMeta(file: FileItem, locale: string) {
  const parts: string[] = [];
  if (file.versionNumber) parts.push(`v${file.versionNumber}`);
  parts.push(formatBytes(file.size, locale));
  parts.push(formatDate(file.createdAt, locale));
  return parts.join(' · ');
}

function TrashRow({
  name,
  meta,
  icon,
  restoring,
  purging,
  admin,
  onRestore,
  onPurge,
}: {
  name: string;
  meta: string;
  icon: ReactNode;
  restoring: boolean;
  purging: boolean;
  admin: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const { t } = useI18n();
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" title={name}>
          {name}
        </p>
        <p className="mt-0.5 text-[0.68rem] text-ink-faint">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" loading={restoring} onClick={onRestore}>
          <RotateCcw className="size-3.5" aria-hidden />
          {t('trash.restore')}
        </Button>
        {admin && (
          <Button variant="danger" size="sm" loading={purging} onClick={onPurge}>
            <Trash2 className="size-3.5" aria-hidden />
            {t('trash.purge')}
          </Button>
        )}
      </div>
    </li>
  );
}
