import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/auth';
import { useToast } from '../context/toast';
import { useI18n } from '../i18n';
import { api, unwrap } from '../lib/api';
import { errorText } from '../lib/errors';
import { formatBytes, formatDate, isEditor } from '../lib/format';
import type { FileItem, VersionItem } from '../lib/types';
import {
  fileInputAccept,
  isAcceptedFile,
  MAX_FILE_SIZE,
  mimeForFile,
  sha256,
  uploadToSignedUrl,
} from '../lib/upload';
import { Badge, Button, EmptyState, Modal, Spinner } from './ui';

export function VersionsDialog({ file, onClose }: { file: FileItem | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!file) return;
    setConfirmRestore(null);
    setProgress(null);
  }, [file]);

  const canEdit = isEditor(user?.role);

  const versionsQuery = useQuery({
    queryKey: ['versions', file?.id],
    queryFn: async () => {
      if (!file) return [];
      const response = await api.api.files[':id'].versions.$get({
        param: { id: file.id },
      });
      return (await unwrap(response)).versions;
    },
    enabled: Boolean(file),
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionNumber: number) => {
      if (!file) return null;
      return unwrap(
        await api.api.files[':id'].versions[':n'].restore.$post({
          param: { id: file.id, n: String(versionNumber) },
        }),
      );
    },
    onSuccess: () => {
      if (!file) return;
      void queryClient.invalidateQueries({ queryKey: ['versions', file.id] });
      void queryClient.invalidateQueries({ queryKey: ['files'] });
      notify(t('versions.restored'), 'success');
      setConfirmRestore(null);
    },
    onError: (cause) => notify(errorText(t, cause), 'error'),
  });

  const uploadMutation = useMutation({
    mutationFn: async (selected: File) => {
      if (!file) return null;
      const mimeType = mimeForFile(selected);
      const prepared = await unwrap(
        await api.api.files[':id'].versions['upload-url'].$post({
          param: { id: file.id },
          json: { size: selected.size, mimeType },
        }),
      );

      await uploadToSignedUrl(prepared.uploadUrl, selected, mimeType, (percent) =>
        setProgress(percent),
      );

      const checksum = await sha256(selected);
      return unwrap(
        await api.api.files[':id'].versions[':n'].confirm.$post({
          param: { id: file.id, n: String(prepared.versionNumber) },
          json: { ticket: prepared.ticket, checksum },
        }),
      );
    },
    onSuccess: () => {
      if (file) {
        void queryClient.invalidateQueries({ queryKey: ['versions', file.id] });
      }
      void queryClient.invalidateQueries({ queryKey: ['files'] });
      notify(t('versions.uploaded'), 'success');
    },
    onError: (cause) => notify(errorText(t, cause), 'error'),
    onSettled: () => setProgress(null),
  });

  const addVersion = (selected: File | null) => {
    if (!selected || !file) return;
    if (!isAcceptedFile(selected)) {
      notify(t('upload.notAllowed', { name: selected.name }), 'error');
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      notify(
        t('upload.tooLarge', {
          name: selected.name,
          size: formatBytes(MAX_FILE_SIZE, locale),
        }),
        'error',
      );
      return;
    }
    uploadMutation.mutate(selected);
  };

  const versions = versionsQuery.data ?? [];
  const currentVersion = versions[0]?.versionNumber ?? file?.versionNumber ?? null;

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      eyebrow={t('fileMenu.versions')}
      title={t('versions.title')}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold text-ink">{file?.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">{t('versions.subtitle')}</p>
        </div>
        {currentVersion ? (
          <Badge tone="accent">
            {t('browse.version')} {currentVersion}
          </Badge>
        ) : null}
      </div>

      {canEdit && (
        <div className="mb-4 border border-dashed border-rule-strong/80 bg-paper/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">{t('versions.newVersion')}</p>
              <p className="mt-0.5 text-xs text-ink-faint">{t('versions.newVersionHint')}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={uploadMutation.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {uploadMutation.isPending ? t('versions.uploading') : t('versions.pickFile')}
            </Button>
          </div>
          {progress !== null && (
            <div className="mt-3 h-1 bg-paper-deep">
              <div
                className="h-full bg-terracotta transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={fileInputAccept}
            className="sr-only"
            onChange={(event) => {
              addVersion(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
        </div>
      )}

      {versionsQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5 text-terracotta" />
        </div>
      ) : versionsQuery.isError ? (
        <p className="border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {t('versions.error')}
        </p>
      ) : versions.length === 0 ? (
        <EmptyState
          icon={<History className="size-5" aria-hidden />}
          title={t('versions.empty')}
          body={t('versions.subtitle')}
        />
      ) : (
        <ul className="divide-y divide-rule border border-rule bg-paper-light">
          {versions.map((version) => (
            <VersionRow
              key={version.id}
              version={version}
              current={version.versionNumber === currentVersion}
              canEdit={canEdit}
              confirming={confirmRestore === version.versionNumber}
              restoring={restoreMutation.isPending}
              onAskRestore={() => setConfirmRestore(version.versionNumber)}
              onCancelRestore={() => setConfirmRestore(null)}
              onRestore={() => restoreMutation.mutate(version.versionNumber)}
            />
          ))}
        </ul>
      )}
    </Modal>
  );
}

function VersionRow({
  version,
  current,
  canEdit,
  confirming,
  restoring,
  onAskRestore,
  onCancelRestore,
  onRestore,
}: {
  version: VersionItem;
  current: boolean;
  canEdit: boolean;
  confirming: boolean;
  restoring: boolean;
  onAskRestore: () => void;
  onCancelRestore: () => void;
  onRestore: () => void;
}) {
  const { t, locale } = useI18n();

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-10 font-display text-lg font-semibold text-ink">
          v{version.versionNumber}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">{formatDate(version.createdAt, locale, true)}</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {formatBytes(version.size, locale)}
            {version.author ? ` · ${t('versions.by', { name: version.author.name })}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {current ? (
            <Badge tone="success">{t('versions.current')}</Badge>
          ) : canEdit ? (
            <Button variant="secondary" size="sm" onClick={onAskRestore}>
              {t('versions.restore')}
            </Button>
          ) : null}
        </div>
      </div>

      {confirming && !current && (
        <div className="mt-3 flex flex-col gap-2 border border-rule bg-paper px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-ink-soft">
            {t('versions.restoreConfirm', { n: version.versionNumber })}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" onClick={onCancelRestore}>
              {t('versions.cancelRestore')}
            </Button>
            <Button size="sm" loading={restoring} onClick={onRestore}>
              {t('versions.confirm', { n: version.versionNumber })}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
