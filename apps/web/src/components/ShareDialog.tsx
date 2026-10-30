import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, ShieldCheck } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useToast } from '../context/toast';
import { useI18n } from '../i18n';
import { api, unwrap } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { errorText } from '../lib/errors';
import { formatDate, formatLocalInput } from '../lib/format';
import type { FileItem, ShareCreated, ShareLinkItem } from '../lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import { Badge, Button, cn, Field, Input, Modal, Spinner } from './ui';

type Mode = 'date' | 'downloads';

function linkState(link: ShareLinkItem): 'active' | 'revoked' | 'expired' | 'exhausted' {
  if (link.revokedAt) return 'revoked';
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
    return 'expired';
  }
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
    return 'exhausted';
  }
  return 'active';
}

const stateTone = {
  active: 'success',
  revoked: 'danger',
  expired: 'neutral',
  exhausted: 'neutral',
} as const;

export function ShareDialog({ file, onClose }: { file: FileItem | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('date');
  const [expiry, setExpiry] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('5');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ShareCreated | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ShareLinkItem | null>(null);

  useEffect(() => {
    if (!file) return;
    setMode('date');
    setExpiry(formatLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
    setMaxDownloads('5');
    setError(null);
    setCreated(null);
    setRevokeTarget(null);
  }, [file]);

  const linksQuery = useQuery({
    queryKey: ['share-links', file?.id],
    queryFn: async () => {
      if (!file) return [];
      const response = await api.api.files[':id']['share-links'].$get({
        param: { id: file.id },
      });
      return (await unwrap(response)).links;
    },
    enabled: Boolean(file),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!file) return null;
      const payload =
        mode === 'date'
          ? {
              expiresAt: new Date(expiry).toISOString(),
              maxDownloads: null,
            }
          : {
              expiresAt: null,
              maxDownloads: Number(maxDownloads),
            };
      return unwrap(
        await api.api.files[':id']['share-links'].$post({
          param: { id: file.id },
          json: payload,
        }),
      );
    },
    onSuccess: (response) => {
      if (!response) return;
      setCreated(response);
      setError(null);
      if (file) {
        void queryClient.invalidateQueries({ queryKey: ['share-links', file.id] });
      }
      notify(t('share.linkReady'), 'success');
    },
    onError: (cause) => setError(errorText(t, cause)),
  });

  const revokeMutation = useMutation({
    mutationFn: async (link: ShareLinkItem) =>
      unwrap(await api.api['share-links'][':id'].$delete({ param: { id: link.id } })),
    onSuccess: () => {
      if (file) {
        void queryClient.invalidateQueries({ queryKey: ['share-links', file.id] });
      }
      setRevokeTarget(null);
      notify(t('share.revokedToast'), 'success');
    },
    onError: (cause) => notify(errorText(t, cause), 'error'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === 'date') {
      if (!expiry || new Date(expiry).getTime() <= Date.now()) {
        setError(t('errors.INVALID_EXPIRY'));
        return;
      }
    } else {
      const count = Number(maxDownloads);
      if (!Number.isInteger(count) || count < 1) {
        setError(t('share.invalidNumber'));
        return;
      }
    }
    createMutation.mutate();
  };

  const copy = async () => {
    if (!created) return;
    const ok = await copyText(created.url);
    notify(t(ok ? 'share.copied' : 'share.copyError'), ok ? 'success' : 'error');
  };

  const links = linksQuery.data ?? [];

  return (
    <>
      <Modal
        open={Boolean(file)}
        onClose={onClose}
        eyebrow={t('fileMenu.share')}
        title={t('share.title', { name: file?.name ?? '' })}
        size="lg"
        footer={
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">{t('share.subtitle')}</p>

        {created && (
          <div className="mt-4 border border-moss/40 bg-moss-soft/60 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-moss" aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-moss">
                {t('share.created')}
              </p>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={created.url}
                onFocus={(event) => event.target.select()}
                className="font-mono text-xs"
              />
              <Button variant="secondary" onClick={() => void copy()}>
                {t('share.copy')}
              </Button>
            </div>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-ink-soft">
              {t('share.once')} {t('share.oneTime')}
            </p>
          </div>
        )}

        <form onSubmit={submit} className="mt-5 border border-rule bg-paper/50 p-4">
          <p className="field-label">{t('share.mode')}</p>
          <div className="inline-flex border border-rule bg-paper-light p-0.5">
            {(['date', 'downloads'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setError(null);
                }}
                aria-pressed={mode === value}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold transition',
                  mode === value ? 'bg-ink text-paper' : 'text-ink-faint hover:text-ink',
                )}
              >
                {t(value === 'date' ? 'share.modeDate' : 'share.modeDownloads')}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {mode === 'date' ? (
              <Field label={t('share.expiresAt')} htmlFor="share-expiry" hint={t('share.dateHint')}>
                <Input
                  id="share-expiry"
                  type="datetime-local"
                  value={expiry}
                  min={formatLocalInput(new Date())}
                  onChange={(event) => setExpiry(event.target.value)}
                />
              </Field>
            ) : (
              <Field
                label={t('share.maxDownloads')}
                htmlFor="share-downloads"
                hint={t('share.downloadsHint')}
              >
                <Input
                  id="share-downloads"
                  type="number"
                  min={1}
                  max={100000}
                  value={maxDownloads}
                  onChange={(event) => setMaxDownloads(event.target.value)}
                />
              </Field>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 border border-danger/30 border-l-4 border-l-danger bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="mt-4" loading={createMutation.isPending}>
            {createMutation.isPending ? t('share.creating') : t('share.create')}
          </Button>
        </form>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow text-[0.58rem] text-ink-faint">{t('share.existing')}</p>
            {linksQuery.isFetching && <Spinner className="size-3 text-ink-faint" />}
          </div>

          {linksQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-4 text-terracotta" />
            </div>
          ) : linksQuery.isError ? (
            <p className="text-xs text-danger">{t('share.loadError')}</p>
          ) : links.length === 0 ? (
            <p className="border border-dashed border-rule-strong/70 bg-paper/50 px-4 py-5 text-xs text-ink-faint">
              {t('share.noLinks')}
            </p>
          ) : (
            <ul className="divide-y divide-rule border border-rule bg-paper-light">
              {links.map((link) => {
                const state = linkState(link);
                return (
                  <li key={link.id} className="flex items-start gap-3 px-4 py-3">
                    <Link2 className="mt-1 size-4 shrink-0 text-ink-faint" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={stateTone[state]}>{t(`share.${state}`)}</Badge>
                        <span className="text-xs text-ink-faint">
                          {link.maxDownloads === null
                            ? t('share.downloadsUnlimited', {
                                count: link.downloadCount,
                              })
                            : t('share.downloads', {
                                count: link.downloadCount,
                                max: link.maxDownloads,
                              })}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">
                        {link.expiresAt
                          ? t('share.expires', {
                              date: formatDate(link.expiresAt, locale, true),
                            })
                          : t('share.never')}
                      </p>
                      <p className="mt-0.5 text-[0.68rem] text-ink-faint">
                        {link.author
                          ? t('share.author', { name: link.author.name })
                          : t('common.system')}
                        {' · '}
                        {formatDate(link.createdAt, locale, true)}
                      </p>
                    </div>
                    {state === 'active' && (
                      <Button variant="secondary" size="sm" onClick={() => setRevokeTarget(link)}>
                        {t('share.revoke')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={t('share.revoke')}
        body={t('share.revokeConfirm')}
        confirmLabel={revokeMutation.isPending ? t('share.creating') : t('share.revoke')}
        loading={revokeMutation.isPending}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) revokeMutation.mutate(revokeTarget);
        }}
      />
    </>
  );
}
