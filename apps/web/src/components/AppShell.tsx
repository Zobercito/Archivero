import { useQuery } from '@tanstack/react-query';
import {
  Folder,
  FolderOpen,
  History,
  LogOut,
  Menu,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from '../context/auth';
import { useI18n } from '../i18n';
import { api, unwrap } from '../lib/api';
import { initials, isAdmin, isEditor } from '../lib/format';
import type { FolderTreeNode } from '../lib/types';
import { LanguageToggle } from './LanguageToggle';
import { Logo } from './Logo';
import { RoleBadge } from './RoleBadge';
import { IconButton, Spinner, cn } from './ui';

type TreeNode = FolderTreeNode & { children: TreeNode[] };

function buildTree(folders: FolderTreeNode[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const folder of folders) {
    nodes.set(folder.id, { ...folder, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    for (const item of list) sort(item.children);
  };
  sort(roots);
  return roots;
}

function FolderBranch({
  nodes,
  depth,
  onNavigate,
}: {
  nodes: TreeNode[];
  depth: number;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <li key={node.id}>
          <NavLink
            to={`/folder/${node.id}`}
            onClick={onNavigate}
            title={node.name}
            className="nav-link"
            style={{ paddingLeft: `${12 + depth * 14}px` }}
          >
            <Folder className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
            <span className="truncate">{node.name}</span>
          </NavLink>
          {node.children.length > 0 && (
            <FolderBranch
              nodes={node.children}
              depth={depth + 1}
              onNavigate={onNavigate}
            />
          )}
        </li>
      ))}
      {nodes.length === 0 && depth === 0 ? (
        <li className="px-3 py-2 text-xs italic text-ink-faint">
          {t('shell.noFolders')}
        </li>
      ) : null}
    </ul>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const treeQuery = useQuery({
    queryKey: ['folders', 'tree'],
    queryFn: async () => {
      const response = await api.api.folders.tree.$get();
      return (await unwrap(response)).folders;
    },
  });

  const tree = useMemo(() => buildTree(treeQuery.data ?? []), [treeQuery.data]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  if (!user) return null;

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = async () => {
    setLeaving(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setLeaving(false);
    }
  };

  const navItems = [
    { to: '/', label: t('shell.explore'), icon: FolderOpen, end: true, show: true },
    {
      to: '/trash',
      label: t('shell.trash'),
      icon: Trash2,
      end: false,
      show: isEditor(user.role),
    },
    {
      to: '/activity',
      label: t('shell.activity'),
      icon: History,
      end: false,
      show: isAdmin(user.role),
    },
    {
      to: '/users',
      label: t('shell.users'),
      icon: Users,
      end: false,
      show: isAdmin(user.role),
    },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[286px_minmax(0,1fr)]">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <Logo className="size-7 text-ink" />
          <span className="display text-lg">Archivero</span>
        </div>
        <IconButton label={t('shell.menu')} onClick={() => setMenuOpen(true)}>
          <Menu className="size-5" />
        </IconButton>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px] lg:hidden"
          aria-hidden
          onClick={closeMenu}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col border-r border-rule bg-paper-light shadow-[24px_0_60px_-40px_rgba(28,25,23,.5)] transition-transform duration-200 lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:w-auto lg:translate-x-0 lg:shadow-none',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-rule px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center border border-rule bg-paper text-ink">
              <Logo className="size-7" />
            </span>
            <div>
              <p className="eyebrow text-[0.58rem]">{t('shell.archiveLabel')}</p>
              <p className="display text-xl leading-none">Archivero</p>
            </div>
          </div>
          <IconButton
            label={t('shell.closeMenu')}
            onClick={closeMenu}
            className="lg:hidden"
          >
            <X className="size-4" />
          </IconButton>
        </div>

        <nav className="border-b border-rule px-3 py-3">
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} className="nav-link">
                    <Icon className="size-4 text-ink-faint" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
          <div className="mb-2 flex items-center justify-between px-3">
            <p className="eyebrow text-[0.58rem] text-ink-faint">
              {t('shell.folders')}
            </p>
            {treeQuery.isLoading && <Spinner className="size-3 text-ink-faint" />}
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto pb-2">
            {treeQuery.isError ? (
              <p className="px-3 text-xs text-danger">{t('browse.error')}</p>
            ) : (
              <FolderBranch nodes={tree} depth={0} onNavigate={closeMenu} />
            )}
          </div>
        </div>

        <div className="border-t border-rule bg-paper/50 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-light text-xs font-semibold text-ink-soft">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink" title={user.name}>
                {user.name}
              </p>
              <div className="mt-1">
                <RoleBadge role={user.role} />
              </div>
            </div>
            <IconButton
              label={t('shell.logout')}
              onClick={handleLogout}
              disabled={leaving}
            >
              {leaving ? <Spinner /> : <LogOut className="size-4" />}
            </IconButton>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <LanguageToggle />
            <span className="text-[0.58rem] uppercase tracking-[0.16em] text-ink-faint">
              Archivero · 2026
            </span>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:px-10 lg:py-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
