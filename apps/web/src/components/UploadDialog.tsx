import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CloudUpload, X } from 'lucide-react';
import { type DragEvent, useEffect, useRef, useState } from 'react';
import { useToast } from '../context/toast';
import { useI18n } from '../i18n';
import { api, unwrap } from '../lib/api';
import { errorText } from '../lib/errors';
import { formatBytes } from '../lib/format';
import {
  fileInputAccept,
  isAcceptedFile,
  MAX_FILE_SIZE,
  mimeForFile,
  sha256,
  uploadToSignedUrl,
} from '../lib/upload';
import { FileIcon } from './FileIcon';
import { Button, cn, IconButton, Modal } from './ui';

type UploadStatus = 'queued' | 'uploading' | 'confirming' | 'done' | 'error';

type UploadItem = {
  key: string;
  file: File;
  mimeType: string;
  progress: number;
  status: UploadStatus;
  error?: string;
};

export function UploadDialog({
  open,
  folderId,
  onClose,
}: {
  open: boolean;
  folderId: string | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (open) {
      setItems([]);
      setBusy(false);
      setDragActive(false);
    }
  }, [open]);

  const patchItem = (key: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const addFiles = (incoming: FileList | File[]) => {
    if (busy) return;
    const next: UploadItem[] = [];
    for (const file of Array.from(incoming)) {
      if (!isAcceptedFile(file)) {
        notify(t('upload.notAllowed', { name: file.name }), 'error');
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        notify(
          t('upload.tooLarge', {
            name: file.name,
            size: formatBytes(MAX_FILE_SIZE, locale),
          }),
          'error',
        );
        continue;
      }
      counter.current += 1;
      next.push({
        key: `item-${counter.current}`,
        file,
        mimeType: mimeForFile(file),
        progress: 0,
        status: 'queued',
      });
    }
    if (next.length > 0) {
      setItems((current) => [...current, ...next]);
    }
  };

  const mutation = useMutation({
    mutationFn: async (batch: UploadItem[]) => {
      let completed = 0;
      for (const item of batch) {
        patchItem(item.key, { status: 'uploading', progress: 0, error: undefined });
        try {
          const prepared = await unwrap(
            await api.api.files['upload-url'].$post({
              json: {
                folderId,
                name: item.file.name,
                size: item.file.size,
                mimeType: item.mimeType,
              },
            }),
          );

          await uploadToSignedUrl(prepared.uploadUrl, item.file, item.mimeType, (percent) =>
            patchItem(item.key, { progress: percent }),
          );

          patchItem(item.key, { status: 'confirming', progress: 100 });
          const checksum = await sha256(item.file);
          await unwrap(
            await api.api.files[':id'].confirm.$post({
              param: { id: prepared.file.id },
              json: { ticket: prepared.ticket, checksum },
            }),
          );

          patchItem(item.key, { status: 'done', progress: 100 });
          completed += 1;
        } catch (cause) {
          patchItem(item.key, {
            status: 'error',
            error: errorText(t, cause),
          });
        }
      }
      return completed;
    },
    onSuccess: (completed) => {
      void queryClient.invalidateQueries({ queryKey: ['files'] });
      if (completed > 0) notify(t('upload.success'), 'success');
    },
    onSettled: () => setBusy(false),
  });

  const pending = items.filter((item) => item.status === 'queued' || item.status === 'error');
  const done = items.filter((item) => item.status === 'done').length;

  const start = (batch: UploadItem[]) => {
    if (batch.length === 0 || busy) return;
    setBusy(true);
    mutation.mutate(batch);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  };

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      eyebrow={t('browse.upload')}
      title={t('upload.title')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            {t('common.close')}
          </Button>
          {pending.length > 0 && (
            <Button loading={busy} onClick={() => start(pending)} disabled={items.length === 0}>
              {busy ? t('upload.uploading') : t('upload.submit', { count: pending.length })}
            </Button>
          )}
          {pending.length === 0 && done > 0 && (
            <span className="self-center text-xs text-ink-faint">{t('upload.finished')}</span>
          )}
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-soft">{t('upload.subtitle')}</p>

      <label
        htmlFor="upload-input"
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn(
          'mt-5 flex cursor-pointer flex-col items-center justify-center border border-dashed px-6 py-9 text-center transition',
          dragActive
            ? 'border-terracotta bg-terracotta-soft/50'
            : 'border-rule-strong/80 bg-paper/60 hover:border-terracotta/60 hover:bg-paper-light',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <CloudUpload className="size-7 text-terracotta" aria-hidden />
        <span className="mt-3 text-sm font-semibold text-ink">{t('upload.drop')}</span>
        <span className="mt-1 text-xs text-ink-faint">{t('upload.chooseHint')}</span>
        <span className="mt-3 border border-rule bg-paper-light px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-rule-strong">
          {t('upload.choose')}
        </span>
        <span className="mt-3 text-[0.66rem] leading-relaxed text-ink-faint">
          {t('upload.hint', { size: formatBytes(MAX_FILE_SIZE, locale) })}
        </span>
        <input
          ref={inputRef}
          id="upload-input"
          type="file"
          multiple
          accept={fileInputAccept}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      {items.length > 0 ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow text-[0.58rem] text-ink-faint">
              {t('upload.selected')} · {items.length}
            </p>
            {!busy && (
              <button
                type="button"
                onClick={() => setItems([])}
                className="text-xs text-ink-faint underline decoration-rule underline-offset-4 hover:text-danger"
              >
                {t('upload.removeAll')}
              </button>
            )}
          </div>
          <ul className="divide-y divide-rule border border-rule bg-paper-light">
            {items.map((item) => (
              <li key={item.key} className="flex items-center gap-3 px-3 py-2.5">
                <FileIcon name={item.file.name} mimeType={item.mimeType} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-medium text-ink">{item.file.name}</p>
                    <span className="shrink-0 text-[0.68rem] text-ink-faint">
                      {formatBytes(item.file.size, locale)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full bg-paper-deep">
                    <div
                      className={cn(
                        'h-full transition-[width] duration-200',
                        item.status === 'error'
                          ? 'bg-danger'
                          : item.status === 'done'
                            ? 'bg-moss'
                            : 'bg-terracotta',
                      )}
                      style={{
                        width: item.status === 'error' ? '100%' : `${item.progress}%`,
                      }}
                    />
                  </div>
                  <p
                    className={cn(
                      'mt-1 text-[0.68rem]',
                      item.status === 'error' ? 'text-danger' : 'text-ink-faint',
                    )}
                  >
                    {item.status === 'queued' && t('upload.status.queued')}
                    {item.status === 'uploading' &&
                      t('upload.status.uploading', { percent: item.progress })}
                    {item.status === 'confirming' && t('upload.status.confirming')}
                    {item.status === 'done' && t('upload.status.done')}
                    {item.status === 'error' && (item.error ?? t('upload.status.error'))}
                  </p>
                </div>
                {!busy && item.status !== 'done' && (
                  <IconButton
                    label={t('upload.remove')}
                    onClick={() =>
                      setItems((current) => current.filter((entry) => entry.key !== item.key))
                    }
                  >
                    <X className="size-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
          {busy && <p className="mt-2 text-xs text-ink-faint">{t('upload.inProgress')}</p>}
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-faint">{t('upload.none')}</p>
      )}
    </Modal>
  );
}
