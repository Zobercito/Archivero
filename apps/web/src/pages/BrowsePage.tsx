import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Download,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  History,
  PencilLine,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DeleteDialog,
  MoveDialog,
  NewFolderDialog,
  RenameDialog,
} from '../components/browse-dialogs';
import { FileIcon } from '../components/FileIcon';
import { PageHeader } from '../components/PageHeader';
import { ShareDialog } from '../components/ShareDialog';
import { UploadDialog } from '../components/UploadDialog';
import { ActionMenu, Badge, Button, EmptyState, Spinner } from '../components/ui';
import { VersionsDialog } from '../components/VersionsDialog';
import { useAuth } from '../context/auth';
import { useToast } from '../context/toast';
import { useI18n } from '../i18n';
import { api, unwrap } from '../lib/api';
import { saveUrl } from '../lib/download';
import { errorText } from '../lib/errors';
import { folderChain } from '../lib/folders';
import { formatBytes, formatDate, initials, isEditor } from '../lib/format';
import type { FileItem, FolderItem } from '../lib/types';

type RenameTarget = { type: 'folder' | 'file'; id: string; name: string };
type MoveTarget = RenameTarget & { parentId: string | null };
type DeleteTarget = { type: 'folder' | 'file'; id: string; name: string };

export function BrowsePage() {
  const { folderId } = useParams();
  const currentFolderId = folderId ?? null;
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const canEdit = isEditor(user?.role);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [versionsFile, setVersionsFile] = useState<FileItem | null>(null);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);

  const treeQuery = useQuery({
    queryKey: ['folders', 'tree'],
    queryFn: async () => {
      const response = await api.api.folders.tree.$get();
      return (await unwrap(response)).folders;
    },
  });

  const chain = currentFolderId ? folderChain(treeQuery.data ?? [], currentFolderId) : [];
  const folderMissing = Boolean(currentFolderId) && treeQuery.isSuccess && chain.length === 0;

  const foldersQuery = useQuery({
    queryKey: ['folders', 'list', currentFolderId],
    enabled: !folderMissing,
    queryFn: async () => {
      const response = await api.api.folders.$get({
        query: currentFolderId ? { parentId: currentFolderId } : {},
      });
      return (await unwrap(response)).folders;
    },
  });

  const filesQuery = useQuery({
    queryKey: ['files', 'list', currentFolderId],
    enabled: !folderMissing,
    queryFn: async () => {
      const response = await api.api.files.$get({
        query: currentFolderId ? { folderId: currentFolderId } : {},
      });
      return (await unwrap(response)).files;
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (file: FileItem) =>
      unwrap(await api.api.files[':id'].download.$get({ param: { id: file.id } })),
    onSuccess: (result) => saveUrl(result.url),
    onError: (cause) => notify(errorText(t, cause), 'error'),
  });

  const folders = foldersQuery.data ?? [];
  const files = filesQuery.data ?? [];
  const loading = foldersQuery.isLoading || filesQuery.isLoading;
  const loadError = foldersQuery.isError || filesQuery.isError;
  const currentFolder = chain.at(-1);
  const title = currentFolder?.name ?? t('browse.rootTitle');
  const eyebrow = currentFolder ? t('browse.folderEyebrow') : t('browse.rootEyebrow');

  const fileMenu = (file: FileItem) => [
    {
      label: t('fileMenu.download'),
      icon: <Download className="size-4" aria-hidden />,
      onSelect: () => downloadMutation.mutate(file),
    },
    {
      label: t('fileMenu.versions'),
      icon: <History className="size-4" aria-hidden />,
      onSelect: () => setVersionsFile(file),
    },
    ...(canEdit
      ? [
          {
            label: t('fileMenu.share'),
            icon: <Share2 className="size-4" aria-hidden />,
            onSelect: () => setShareFile(file),
          },
          {
            label: t('fileMenu.rename'),
            icon: <PencilLine className="size-4" aria-hidden />,
            onSelect: () => setRenameTarget({ type: 'file', id: file.id, name: file.name }),
          },
          {
            label: t('fileMenu.move'),
            icon: <FolderInput className="size-4" aria-hidden />,
            onSelect: () =>
              setMoveTarget({
                type: 'file',
                id: file.id,
                name: file.name,
                parentId: file.folderId,
              }),
          },
          {
            label: t('fileMenu.delete'),
            icon: <Trash2 className="size-4" aria-hidden />,
            danger: true,
            onSelect: () => setDeleteTarget({ type: 'file', id: file.id, name: file.name }),
          },
        ]
      : []),
  ];

  return (
    <div className="animate-enter">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={
          folderMissing
            ? undefined
            : t('browse.subtitle', { folders: folders.length, files: files.length })
        }
        above={
          chain.length > 0 ? (
            <nav
              aria-label={t('browse.breadcrumbHome')}
              className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint"
            >
              <Link
                to="/"
                className="transition hover:text-ink hover:underline hover:decoration-rule-strong hover:underline-offset-4"
              >
                {t('browse.breadcrumbHome')}
              </Link>
              {chain.map((folder, index) => (
                <span key={folder.id} className="flex items-center gap-1.5">
                  <span aria-hidden>/</span>
                  {index === chain.length - 1 ? (
                    <span className="font-semibold text-ink">{folder.name}</span>
                  ) : (
                    <Link
                      to={`/folder/${folder.id}`}
                      className="transition hover:text-ink hover:underline hover:decoration-rule-strong hover:underline-offset-4"
                    >
                      {folder.name}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          ) : undefined
        }
        actions={
          canEdit ? (
            <>
              <Button variant="secondary" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus className="size-4" aria-hidden />
                {t('browse.newFolder')}
              </Button>
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="size-4" aria-hidden />
                {t('browse.upload')}
              </Button>
            </>
          ) : undefined
        }
      />

      {folderMissing ? (
        <div className="mt-8">
          <EmptyState
            icon={<FolderOpen className="size-5" aria-hidden />}
            title={t('browse.notFound')}
            body={t('browse.notFoundBody')}
            action={
              <Link
                to="/"
                className="inline-flex border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition hover:border-terracotta-dark hover:bg-terracotta-dark"
              >
                {t('notFound.back')}
              </Link>
            }
          />
        </div>
      ) : loadError ? (
        <div className="mt-8 border border-danger/30 border-l-4 border-l-danger bg-danger-soft px-5 py-6">
          <p className="text-sm text-danger">{t('browse.error')}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              void foldersQuery.refetch();
              void filesQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : loading ? (
        <div className="mt-8 flex items-center gap-3 border border-rule bg-paper-light px-5 py-10 text-sm text-ink-soft">
          <Spinner className="size-4 text-terracotta" />
          {t('browse.loading')}
        </div>
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<FolderOpen className="size-5" aria-hidden />}
            title={t('browse.emptyTitle')}
            body={canEdit ? t('browse.emptyBody') : t('browse.emptyViewer')}
            action={
              canEdit ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={() => setNewFolderOpen(true)}>
                    <FolderPlus className="size-4" aria-hidden />
                    {t('browse.newFolder')}
                  </Button>
                  <Button onClick={() => setUploadOpen(true)}>
                    <Upload className="size-4" aria-hidden />
                    {t('browse.upload')}
                  </Button>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          {folders.length > 0 && (
            <section className="mt-8">
              <h2 className="eyebrow text-ink-faint">
                {t('browse.foldersHeading')}
                <span className="ml-2 font-sans text-[0.66rem] tracking-normal text-ink-faint/80">
                  {folders.length}
                </span>
              </h2>
              <div className="mt-4 grid gap-x-3 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                {folders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    canEdit={canEdit}
                    onOpen={() => navigate(`/folder/${folder.id}`)}
                    onRename={() =>
                      setRenameTarget({
                        type: 'folder',
                        id: folder.id,
                        name: folder.name,
                      })
                    }
                    onMove={() =>
                      setMoveTarget({
                        type: 'folder',
                        id: folder.id,
                        name: folder.name,
                        parentId: folder.parentId,
                      })
                    }
                    onDelete={() =>
                      setDeleteTarget({
                        type: 'folder',
                        id: folder.id,
                        name: folder.name,
                      })
                    }
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mt-9">
            <h2 className="eyebrow text-ink-faint">
              {t('browse.filesHeading')}
              <span className="ml-2 font-sans text-[0.66rem] tracking-normal text-ink-faint/80">
                {files.length}
              </span>
            </h2>

            {files.length === 0 ? (
              <p className="mt-4 border border-dashed border-rule-strong/70 bg-paper/50 px-4 py-6 text-sm text-ink-faint">
                {t('browse.noFiles')}
              </p>
            ) : (
              <div className="mt-4 border border-rule bg-paper-light">
                <div className="hidden border-b border-rule bg-paper/60 px-4 py-2 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-ink-faint md:grid md:grid-cols-[minmax(0,1fr)_72px_84px_112px_112px_36px] md:gap-3">
                  <span>{t('browse.document')}</span>
                  <span>{t('browse.version')}</span>
                  <span>{t('browse.size')}</span>
                  <span>{t('browse.updated')}</span>
                  <span>{t('browse.owner')}</span>
                  <span className="text-right">{t('browse.actions')}</span>
                </div>
                <ul className="divide-y divide-rule">
                  {files.map((file) => (
                    <li
                      key={file.id}
                      className="ledger-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_72px_84px_112px_112px_36px]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <FileIcon name={file.name} mimeType={file.mimeType} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink" title={file.name}>
                            {file.name}
                          </p>
                          <p className="mt-0.5 text-[0.68rem] text-ink-faint md:hidden">
                            {file.versionNumber
                              ? `v${file.versionNumber} · ${formatBytes(file.size, locale)} · ${formatDate(file.updatedAt, locale)}`
                              : t('browse.noVersion')}
                          </p>
                        </div>
                      </div>
                      <div className="hidden md:block">
                        {file.status === 'ready' && file.versionNumber ? (
                          <span className="text-xs font-semibold text-ink-soft">
                            v{file.versionNumber}
                          </span>
                        ) : (
                          <Badge>{t('browse.noVersion')}</Badge>
                        )}
                      </div>
                      <span className="hidden text-xs text-ink-soft md:block">
                        {formatBytes(file.size, locale)}
                      </span>
                      <span
                        className="hidden text-xs text-ink-soft md:block"
                        title={formatDate(file.updatedAt, locale, true)}
                      >
                        {formatDate(file.updatedAt, locale)}
                      </span>
                      <span className="hidden min-w-0 items-center gap-1.5 md:flex">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-rule bg-paper text-[0.55rem] font-semibold text-ink-soft">
                          {file.owner ? initials(file.owner.name) : '—'}
                        </span>
                        <span className="truncate text-xs text-ink-soft">
                          {file.owner?.name ?? t('common.unknown')}
                        </span>
                      </span>
                      <div className="justify-self-end">
                        <ActionMenu label={t('browse.actions')} items={fileMenu(file)} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      <NewFolderDialog
        open={newFolderOpen}
        parentId={currentFolderId}
        onClose={() => setNewFolderOpen(false)}
      />
      <UploadDialog
        open={uploadOpen}
        folderId={currentFolderId}
        onClose={() => setUploadOpen(false)}
      />
      <RenameDialog target={renameTarget} onClose={() => setRenameTarget(null)} />
      <MoveDialog
        target={moveTarget}
        folders={treeQuery.data ?? []}
        onClose={() => setMoveTarget(null)}
      />
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <VersionsDialog file={versionsFile} onClose={() => setVersionsFile(null)} />
      <ShareDialog file={shareFile} onClose={() => setShareFile(null)} />
    </div>
  );
}

function FolderCard({
  folder,
  canEdit,
  onOpen,
  onRename,
  onMove,
  onDelete,
}: {
  folder: FolderItem;
  canEdit: boolean;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const { t, locale } = useI18n();

  return (
    <div className="folder-card group relative pt-1.5">
      <Link
        to={`/folder/${folder.id}`}
        className="flex min-h-[136px] flex-col justify-between border border-rule bg-paper-light/95 px-4 pb-4 pt-5 transition group-hover:border-rule-strong group-hover:bg-paper-light"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-9 items-center justify-center border border-rule bg-paper-deep/70 text-ink-soft transition group-hover:border-terracotta/30 group-hover:bg-terracotta-soft group-hover:text-terracotta-dark">
            <Folder className="size-4" aria-hidden />
          </span>
          {!canEdit && (
            <ArrowUpRight
              className="size-4 text-ink-faint opacity-0 transition group-hover:opacity-100"
              aria-hidden
            />
          )}
        </div>
        <div className="mt-4 min-w-0">
          <p className="display truncate text-lg" title={folder.name}>
            {folder.name}
          </p>
          <p className="mt-1 text-[0.68rem] text-ink-faint">
            {t('browse.folderMeta', {
              date: formatDate(folder.createdAt, locale),
            })}
            {folder.owner ? ` · ${folder.owner.name}` : ''}
          </p>
        </div>
      </Link>

      {canEdit && (
        <div className="absolute right-2 top-3 z-10">
          <ActionMenu
            label={t('browse.actions')}
            items={[
              {
                label: t('folderMenu.open'),
                icon: <FolderOpen className="size-4" aria-hidden />,
                onSelect: onOpen,
              },
              {
                label: t('folderMenu.rename'),
                icon: <PencilLine className="size-4" aria-hidden />,
                onSelect: onRename,
              },
              {
                label: t('folderMenu.move'),
                icon: <FolderInput className="size-4" aria-hidden />,
                onSelect: onMove,
              },
              {
                label: t('folderMenu.delete'),
                icon: <Trash2 className="size-4" aria-hidden />,
                danger: true,
                onSelect: onDelete,
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
