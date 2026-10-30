import type { FolderTreeNode } from './types';

export type FolderNode = FolderTreeNode & { children: FolderNode[] };

export function buildFolderTree(folders: FolderTreeNode[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const folder of folders) nodes.set(folder.id, { ...folder, children: [] });

  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: FolderNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    for (const item of list) sort(item.children);
  };
  sort(roots);
  return roots;
}

export function flattenFolderTree(
  nodes: FolderNode[],
  depth = 0,
): Array<{ folder: FolderTreeNode; depth: number }> {
  return nodes.flatMap((node) => [
    { folder: node, depth },
    ...flattenFolderTree(node.children, depth + 1),
  ]);
}

export function folderSubtreeIds(folders: FolderTreeNode[], folderId: string) {
  const ids = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function folderChain(folders: FolderTreeNode[], folderId: string) {
  const map = new Map(folders.map((folder) => [folder.id, folder]));
  const chain: FolderTreeNode[] = [];
  const seen = new Set<string>();
  let current = map.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return chain;
}
