import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { useToast } from '../context/toast';
import { useI18n } from '../i18n';
import { api, unwrap } from '../lib/api';
import { errorText } from '../lib/errors';
import { buildFolderTree, flattenFolderTree, folderSubtreeIds } from '../lib/folders';
import type { FolderTreeNode } from '../lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, Field, Input, Modal, Select } from './ui';

type TargetType = 'folder' | 'file';

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="border border-danger/30 border-l-4 border-l-danger bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger"
    >
      {message}
    </p>
  );
}

export function NewFolderDialog({
  open,
  parentId,
  onClose,
}: {
  open: boolean;
  parentId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.api.folders.$post({
          json: { name: name.trim(), parentId },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      notify(t('browse.folderCreated'), 'success');
      onClose();
    },
    onError: (cause) => setError(errorText(t, cause)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t('dialog.nameRequired'));
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={t('shell.folders')}
      title={t('dialog.newFolder.title')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="new-folder-form" loading={mutation.isPending}>
            {t('dialog.createFolder')}
          </Button>
        </>
      }
    >
      <form id="new-folder-form" onSubmit={submit} className="space-y-3">
        <Field label={t('dialog.nameLabel')} htmlFor="new-folder-name">
          <Input
            id="new-folder-name"
            autoFocus
            maxLength={120}
            placeholder={t('dialog.namePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <ErrorNote message={error} />
      </form>
    </Modal>
  );
}

type RenameTarget = { type: TargetType; id: string; name: string };

export function RenameDialog({
  target,
  onClose,
}: {
  target: RenameTarget | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setName(target.name);
      setError(null);
    }
  }, [target]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) return null;
      const body = { name: name.trim() };
      if (target.type === 'folder') {
        return unwrap(
          await api.api.folders[':id'].$patch({
            param: { id: target.id },
            json: body,
          }),
        );
      }
      return unwrap(
        await api.api.files[':id'].$patch({
          param: { id: target.id },
          json: body,
        }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['files'] });
      notify(
        t(target?.type === 'folder' ? 'browse.folderRenamed' : 'browse.fileRenamed'),
        'success',
      );
      onClose();
    },
    onError: (cause) => setError(errorText(t, cause)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t('dialog.nameRequired'));
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      eyebrow={t('common.rename')}
      title={
        target?.type === 'folder' ? t('dialog.renameFolder.title') : t('dialog.renameFile.title')
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="rename-form" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="rename-form" onSubmit={submit} className="space-y-3">
        {target?.type === 'file' && (
          <p className="text-xs leading-relaxed text-ink-faint">{t('versions.sameType')}</p>
        )}
        <Field label={t('dialog.nameLabel')} htmlFor="rename-name">
          <Input
            id="rename-name"
            autoFocus
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <ErrorNote message={error} />
      </form>
    </Modal>
  );
}

type MoveTarget = {
  type: TargetType;
  id: string;
  name: string;
  parentId: string | null;
};

export function MoveDialog({
  target,
  folders,
  onClose,
}: {
  target: MoveTarget | null;
  folders: FolderTreeNode[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [destination, setDestination] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setDestination(target.parentId ?? '');
      setError(null);
    }
  }, [target]);

  const excluded =
    target?.type === 'folder' ? folderSubtreeIds(folders, target.id) : new Set<string>();
  const options = flattenFolderTree(buildFolderTree(folders)).filter(
    ({ folder }) => !excluded.has(folder.id),
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) return null;
      const parentId = destination || null;
      if (target.type === 'folder') {
        return unwrap(
          await api.api.folders[':id'].$patch({
            param: { id: target.id },
            json: { parentId },
          }),
        );
      }
      return unwrap(
        await api.api.files[':id'].$patch({
          param: { id: target.id },
          json: { folderId: parentId },
        }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['files'] });
      notify(t('browse.moved'), 'success');
      onClose();
    },
    onError: (cause) => setError(errorText(t, cause)),
  });

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      eyebrow={t('common.move')}
      title={t('dialog.move.title', { name: target?.name ?? '' })}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? t('dialog.moving') : t('dialog.moveHere')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field
          label={t('dialog.destination')}
          htmlFor="move-destination"
          hint={t('dialog.moveHint')}
        >
          <Select
            id="move-destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          >
            <option value="">{t('common.root')}</option>
            {options.map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>
                {`${'— '.repeat(depth)}${folder.name}`}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}

type DeleteTarget = { type: TargetType; id: string; name: string };

export function DeleteDialog({
  target,
  onClose,
}: {
  target: DeleteTarget | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) setError(null);
  }, [target]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) return null;
      if (target.type === 'folder') {
        return unwrap(await api.api.folders[':id'].$delete({ param: { id: target.id } }));
      }
      return unwrap(await api.api.files[':id'].$delete({ param: { id: target.id } }));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['files'] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      notify(
        t(target?.type === 'folder' ? 'browse.folderDeleted' : 'browse.fileDeleted'),
        'success',
      );
      onClose();
    },
    onError: (cause) => setError(errorText(t, cause)),
  });

  return (
    <ConfirmDialog
      open={Boolean(target)}
      title={t(target?.type === 'folder' ? 'dialog.deleteFolder.title' : 'dialog.deleteFile.title')}
      body={
        error ??
        t(target?.type === 'folder' ? 'dialog.deleteFolderBody' : 'dialog.deleteBody', {
          name: target?.name ?? '',
        })
      }
      confirmLabel={mutation.isPending ? t('dialog.deleting') : t('dialog.confirmDelete')}
      loading={mutation.isPending}
      onClose={onClose}
      onConfirm={() => mutation.mutate()}
    />
  );
}
