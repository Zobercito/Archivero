import { DEMO_PUBLIC_TOKEN } from '../lib/demo';
import type {
  ActivityItem,
  FileItem,
  FolderItem,
  FolderTreeNode,
  Role,
  ShareLinkItem,
  TrashData,
  UserItem,
  VersionItem,
} from '../lib/types';

export const DEMO_UPLOAD_PREFIX = 'demo://upload/';
export const DEMO_MAX_FILE_SIZE = 25 * 1024 * 1024;

export type OwnerRef = { id: string; name: string };

export type DemoUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
  password: string;
};

export type DemoFolder = {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  createdAt: string;
  deletedAt: string | null;
};

export type DemoFile = {
  id: string;
  folderId: string | null;
  name: string;
  ownerId: string;
  status: FileItem['status'];
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type DemoVersion = {
  id: string;
  fileId: string;
  versionNumber: number;
  storageKey: string;
  size: number;
  mimeType: string;
  checksum: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type DemoShare = {
  id: string;
  fileId: string;
  token: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type DemoActivity = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userId: string | null;
};

export type PendingUpload = {
  userId: string;
  fileId: string;
  versionNumber: number;
  key: string;
  size: number;
  mimeType: string;
  blob?: Blob;
};

export type DemoState = {
  users: DemoUser[];
  folders: DemoFolder[];
  files: DemoFile[];
  versions: DemoVersion[];
  shares: DemoShare[];
  activity: DemoActivity[];
  blobs: Map<string, Blob>;
  pending: Map<string, PendingUpload>;
  objectUrls: Map<string, string>;
  sessionUserId: string | null;
  counter: number;
};

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.now();

function ago(days: number, hours = 0) {
  return new Date(NOW - days * DAY - hours * HOUR).toISOString();
}

function ahead(days: number) {
  return new Date(NOW + days * DAY).toISOString();
}

export function nextId(state: DemoState, prefix: string) {
  state.counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${state.counter}`;
}

export function sessionUser(state: DemoState): DemoUser | null {
  if (!state.sessionUserId) return null;
  const user = state.users.find((item) => item.id === state.sessionUserId);
  return user && !user.disabled ? user : null;
}

export function ownerRef(state: DemoState, userId: string | null): OwnerRef | null {
  if (!userId) return null;
  const user = state.users.find((item) => item.id === userId);
  return user ? { id: user.id, name: user.name } : null;
}

export function userDto(user: DemoUser): UserItem {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    disabled: user.disabled,
    createdAt: user.createdAt,
  };
}

export function folderDto(state: DemoState, folder: DemoFolder): FolderItem {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    owner: ownerRef(state, folder.ownerId),
    createdAt: folder.createdAt,
  };
}

export function folderTreeNode(folder: DemoFolder): FolderTreeNode {
  return { id: folder.id, name: folder.name, parentId: folder.parentId };
}

export function currentVersion(state: DemoState, file: DemoFile): DemoVersion | null {
  if (!file.currentVersionId) return null;
  return state.versions.find((version) => version.id === file.currentVersionId) ?? null;
}

export function fileDto(state: DemoState, file: DemoFile): FileItem {
  const version = currentVersion(state, file);
  const versionCount = state.versions.filter((item) => item.fileId === file.id).length;
  return {
    id: file.id,
    folderId: file.folderId,
    name: file.name,
    status: file.status,
    size: version?.size ?? null,
    mimeType: version?.mimeType ?? null,
    versionNumber: version?.versionNumber ?? null,
    versionCount,
    owner: ownerRef(state, file.ownerId),
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

export function versionDto(state: DemoState, version: DemoVersion): VersionItem {
  return {
    id: version.id,
    fileId: version.fileId,
    versionNumber: version.versionNumber,
    size: version.size,
    mimeType: version.mimeType,
    checksum: version.checksum,
    author: ownerRef(state, version.createdBy),
    createdAt: version.createdAt,
  };
}

export function shareDto(state: DemoState, link: DemoShare): ShareLinkItem {
  return {
    id: link.id,
    fileId: link.fileId,
    expiresAt: link.expiresAt,
    maxDownloads: link.maxDownloads,
    downloadCount: link.downloadCount,
    revokedAt: link.revokedAt,
    createdAt: link.createdAt,
    author: ownerRef(state, link.createdBy),
  };
}

export function activityDto(state: DemoState, entry: DemoActivity): ActivityItem {
  const actor = entry.userId
    ? (state.users.find((user) => user.id === entry.userId) ?? null)
    : null;
  return {
    id: entry.id,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata as ActivityItem['metadata'],
    createdAt: entry.createdAt,
    user: actor ? { id: actor.id, name: actor.name, email: actor.email } : null,
  };
}

export function logActivity(
  state: DemoState,
  input: {
    userId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  state.activity.unshift({
    id: nextId(state, 'act'),
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata ?? null,
    createdAt: new Date().toISOString(),
    userId: input.userId,
  });
}

export function nextVersionNumber(state: DemoState, fileId: string) {
  const numbers = state.versions
    .filter((version) => version.fileId === fileId)
    .map((version) => version.versionNumber);
  return Math.max(0, ...numbers) + 1;
}

export function addVersion(
  state: DemoState,
  input: {
    id?: string;
    fileId: string;
    versionNumber: number;
    storageKey: string;
    blob: Blob;
    mimeType: string;
    checksum: string | null;
    createdBy: string | null;
    createdAt?: string;
  },
) {
  if (!state.blobs.has(input.storageKey)) {
    state.blobs.set(input.storageKey, input.blob);
  }
  const version: DemoVersion = {
    id: input.id ?? nextId(state, 'version'),
    fileId: input.fileId,
    versionNumber: input.versionNumber,
    storageKey: input.storageKey,
    size: input.blob.size,
    mimeType: input.mimeType,
    checksum: input.checksum,
    createdBy: input.createdBy,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  state.versions.push(version);
  return version;
}

export function versionUrl(state: DemoState, version: DemoVersion) {
  const cached = state.objectUrls.get(version.storageKey);
  if (cached) return cached;
  const blob = state.blobs.get(version.storageKey) ?? new Blob([], { type: version.mimeType });
  const url = URL.createObjectURL(blob);
  state.objectUrls.set(version.storageKey, url);
  return url;
}

export function releaseStorageKeys(state: DemoState, keys: string[]) {
  for (const key of new Set(keys)) {
    if (state.versions.some((version) => version.storageKey === key)) continue;
    state.blobs.delete(key);
    const url = state.objectUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    state.objectUrls.delete(key);
  }
}

export function purgeFile(state: DemoState, fileId: string) {
  const keys = state.versions
    .filter((version) => version.fileId === fileId)
    .map((version) => version.storageKey);
  state.versions = state.versions.filter((version) => version.fileId !== fileId);
  state.shares = state.shares.filter((link) => link.fileId !== fileId);
  state.files = state.files.filter((file) => file.id !== fileId);
  releaseStorageKeys(state, keys);
}

export function folderSubtreeIds(state: DemoState, folderId: string) {
  const ids = new Set<string>([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of state.folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function trashData(state: DemoState): TrashData {
  const sortByName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

  const folders = state.folders
    .filter((folder) => {
      if (!folder.deletedAt) return false;
      if (!folder.parentId) return true;
      const parent = state.folders.find((item) => item.id === folder.parentId);
      return !parent?.deletedAt;
    })
    .sort(sortByName)
    .map((folder) => folderDto(state, folder));

  const files = state.files
    .filter((file) => {
      if (!file.deletedAt) return false;
      if (!file.folderId) return true;
      const folder = state.folders.find((item) => item.id === file.folderId);
      return !folder?.deletedAt;
    })
    .sort(sortByName)
    .map((file) => fileDto(state, file));

  return { folders, files };
}

const allowedTypes: Record<string, string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  txt: ['text/plain'],
  md: ['text/markdown', 'text/plain'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

export function extensionOf(name: string) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(name);
  return match?.[1]?.toLowerCase() ?? '';
}

export function isAllowedFileType(name: string, mimeType: string) {
  const mimes = allowedTypes[extensionOf(name)];
  if (!mimes) return false;
  return mimes.includes(mimeType.toLowerCase());
}

function createState(): DemoState {
  return {
    users: [],
    folders: [],
    files: [],
    versions: [],
    shares: [],
    activity: [],
    blobs: new Map(),
    pending: new Map(),
    objectUrls: new Map(),
    sessionUserId: null,
    counter: 0,
  };
}

function textBlob(content: string, type: string) {
  return new Blob([content], { type });
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfBlob(title: string, lines: string[], targetBytes: number) {
  const content = [
    'BT',
    '/F1 18 Tf',
    '72 770 Td',
    `(${escapePdfText(title)}) Tj`,
    'ET',
    'BT',
    '/F1 11 Tf',
    '72 730 Td',
    '16 TL',
    ...lines.flatMap((line) => [`(${escapePdfText(line)}) Tj`, 'T*']),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  if (pdf.length < targetBytes) {
    pdf += `\n%${' '.repeat(Math.max(0, targetBytes - pdf.length - 3))}\n`;
  }

  return new Blob([pdf], { type: 'application/pdf' });
}

export function createInitialState(): DemoState {
  const state = createState();

  state.users.push(
    {
      id: 'u-elena',
      name: 'Elena Ríos',
      email: 'elena@archivero.demo',
      role: 'admin',
      disabled: false,
      createdAt: '2025-11-03T09:00:00.000Z',
      password: 'Admin!2026',
    },
    {
      id: 'u-mateo',
      name: 'Mateo Vidal',
      email: 'mateo@archivero.demo',
      role: 'editor',
      disabled: false,
      createdAt: '2025-12-12T10:30:00.000Z',
      password: 'Editor!2026',
    },
    {
      id: 'u-sofia',
      name: 'Sofía Marín',
      email: 'sofia@archivero.demo',
      role: 'viewer',
      disabled: false,
      createdAt: '2026-01-20T08:15:00.000Z',
      password: 'Lector!2026',
    },
  );

  const addFolder = (
    id: string,
    name: string,
    parentId: string | null,
    ownerId: string,
    createdAt: string,
    deletedAt: string | null = null,
  ) => {
    state.folders.push({ id, name, parentId, ownerId, createdAt, deletedAt });
  };

  addFolder('f-contratos', 'Contratos 2026', null, 'u-elena', ago(320));
  addFolder('f-clientes', 'Clientes', 'f-contratos', 'u-mateo', ago(210));
  addFolder('f-facturas', 'Facturas', null, 'u-mateo', ago(300));
  addFolder('f-manuales', 'Manuales', null, 'u-elena', ago(180));
  addFolder('f-rrhh', 'Recursos Humanos', null, 'u-elena', ago(260));
  addFolder('f-borradores', 'Borradores 2025', null, 'u-mateo', ago(400), ago(5));

  const addFile = (input: {
    id: string;
    folderId: string | null;
    name: string;
    ownerId: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
    versions: Array<{
      mimeType: string;
      content: Blob;
      createdBy: string;
      createdAt: string;
    }>;
  }) => {
    const versions = input.versions.map((version, index) =>
      addVersion(state, {
        id: `version-${input.id}-${index + 1}`,
        fileId: input.id,
        versionNumber: index + 1,
        storageKey: `demo/${input.id}/v${index + 1}`,
        blob: version.content,
        mimeType: version.mimeType,
        checksum: null,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
      }),
    );
    const current = versions.at(-1) ?? null;
    state.files.push({
      id: input.id,
      folderId: input.folderId,
      name: input.name,
      ownerId: input.ownerId,
      status: current ? 'ready' : 'pending',
      currentVersionId: current?.id ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      deletedAt: input.deletedAt ?? null,
    });
  };

  addFile({
    id: 'file-guia',
    folderId: null,
    name: 'Guía de marca.pdf',
    ownerId: 'u-elena',
    createdAt: ago(260),
    updatedAt: ago(3),
    versions: [
      {
        mimeType: 'application/pdf',
        content: pdfBlob(
          'Guia de marca Archivero',
          [
            'Paleta: papel, tinta y terracota.',
            'Tipografia: Fraunces para titulos, Inter para textos.',
            'El archivo se lee con calma: margenes amplios y jerarquia clara.',
          ],
          180_000,
        ),
        createdBy: 'u-elena',
        createdAt: ago(260),
      },
      {
        mimeType: 'application/pdf',
        content: pdfBlob(
          'Guia de marca Archivero',
          [
            'Paleta: papel, tinta y terracota.',
            'Tipografia: Fraunces para titulos, Inter para textos.',
            'El archivo se lee con calma: margenes amplios y jerarquia clara.',
            'Version 2: se anadieron ejemplos de portada y contraportada.',
            'Los documentos compartidos conservan el sello discreto de Archivero.',
          ],
          210_000,
        ),
        createdBy: 'u-mateo',
        createdAt: ago(3),
      },
    ],
  });

  addFile({
    id: 'file-notas',
    folderId: null,
    name: 'Notas de la semana.md',
    ownerId: 'u-mateo',
    createdAt: ago(2),
    updatedAt: ago(1, 4),
    versions: [
      {
        mimeType: 'text/markdown',
        content: textBlob(
          `# Notas de la semana

- Revisar el contrato de Norte antes del viernes.
- Preparar la factura 2026-015.
- Actualizar el manual con el flujo de restauración.
- Confirmar la plantilla de vacaciones con Recursos Humanos.
`,
          'text/markdown',
        ),
        createdBy: 'u-mateo',
        createdAt: ago(2),
      },
    ],
  });

  addFile({
    id: 'file-contrato',
    folderId: 'f-contratos',
    name: 'Contrato marco · Norte.pdf',
    ownerId: 'u-elena',
    createdAt: ago(300),
    updatedAt: ago(40),
    versions: [
      {
        mimeType: 'application/pdf',
        content: pdfBlob(
          'Contrato marco de servicios',
          [
            'Entre Archivero y Grupo Norte se acuerda el servicio de archivo y custodia documental.',
            'Vigencia: doce meses desde la firma.',
            'Condiciones: confidencialidad, disponibilidad y soporte en horario laboral.',
            'Cada entrega conserva su version anterior y queda registrada en el historial.',
          ],
          240_000,
        ),
        createdBy: 'u-elena',
        createdAt: ago(300),
      },
      {
        mimeType: 'application/pdf',
        content: pdfBlob(
          'Contrato marco de servicios',
          [
            'Entre Archivero y Grupo Norte se acuerda el servicio de archivo y custodia documental.',
            'Vigencia: doce meses desde la firma.',
            'Condiciones: confidencialidad, disponibilidad y soporte en horario laboral.',
            'Cada entrega conserva su version anterior y queda registrada en el historial.',
            'Anexo I: niveles de servicio y tiempos de respuesta.',
            'Anexo II: tratamiento de documentos confidenciales y devolucion final.',
          ],
          265_000,
        ),
        createdBy: 'u-elena',
        createdAt: ago(40),
      },
    ],
  });

  addFile({
    id: 'file-anexo',
    folderId: 'f-clientes',
    name: 'Anexo de servicios.pdf',
    ownerId: 'u-mateo',
    createdAt: ago(200),
    updatedAt: ago(90),
    versions: [
      {
        mimeType: 'application/pdf',
        content: pdfBlob(
          'Anexo de servicios',
          [
            'Horario de soporte: lunes a viernes, 9:00 a 18:00.',
            'Tiempo de respuesta: cuatro horas laborables.',
            'Canal: correo y mesa de ayuda.',
            'Las incidencias criticas se escalan al responsable de guardia.',
          ],
          120_000,
        ),
        createdBy: 'u-mateo',
        createdAt: ago(90),
      },
    ],
  });

  addFile({
    id: 'file-factura-014',
    folderId: 'f-facturas',
    name: 'Factura 2026-014.csv',
    ownerId: 'u-mateo',
    createdAt: ago(110),
    updatedAt: ago(108),
    versions: [
      {
        mimeType: 'text/csv',
        content: textBlob(
          `fecha;concepto;importe;estado
2026-04-02;Servicio de archivo;1240,00;Pagada
2026-04-02;Soporte adicional;180,00;Pagada
2026-04-02;Almacenamiento;95,00;Pagada
`,
          'text/csv',
        ),
        createdBy: 'u-mateo',
        createdAt: ago(108),
      },
    ],
  });

  addFile({
    id: 'file-factura-015',
    folderId: 'f-facturas',
    name: 'Factura 2026-015.csv',
    ownerId: 'u-mateo',
    createdAt: ago(80),
    updatedAt: ago(15),
    versions: [
      {
        mimeType: 'text/csv',
        content: textBlob(
          `fecha;concepto;importe;estado
2026-05-04;Servicio de archivo;1240,00;Pendiente
2026-05-04;Migracion de expedientes;320,00;Pendiente
`,
          'text/csv',
        ),
        createdBy: 'u-mateo',
        createdAt: ago(15),
      },
    ],
  });

  addFile({
    id: 'file-manual',
    folderId: 'f-manuales',
    name: 'Manual de uso.md',
    ownerId: 'u-elena',
    createdAt: ago(170),
    updatedAt: ago(6),
    versions: [
      {
        mimeType: 'text/markdown',
        content: textBlob(
          `# Manual de uso

Archivero conserva cada versión de un documento. Al subir un reemplazo, la versión anterior sigue disponible.

## Roles

- Administración: gestiona personas, papelera y actividad.
- Edición: sube, organiza y comparte documentos.
- Lectura: consulta y descarga.

## Enlaces

Los enlaces públicos caducan por fecha o por número de descargas.
`,
          'text/markdown',
        ),
        createdBy: 'u-elena',
        createdAt: ago(170),
      },
      {
        mimeType: 'text/markdown',
        content: textBlob(
          `# Manual de uso

Archivero conserva cada versión de un documento. Al subir un reemplazo, la versión anterior sigue disponible.

## Roles

- Administración: gestiona personas, papelera y actividad.
- Edición: sube, organiza y comparte documentos.
- Lectura: consulta y descarga.

## Enlaces

Los enlaces públicos caducan por fecha o por número de descargas.

## Papelera

Los documentos eliminados se pueden restaurar. Solo la administración puede borrarlos definitivamente.
`,
          'text/markdown',
        ),
        createdBy: 'u-mateo',
        createdAt: ago(60),
      },
      {
        mimeType: 'text/markdown',
        content: textBlob(
          `# Manual de uso

Archivero conserva cada versión de un documento. Al subir un reemplazo, la versión anterior sigue disponible.

## Roles

- Administración: gestiona personas, papelera y actividad.
- Edición: sube, organiza y comparte documentos.
- Lectura: consulta y descarga.

## Enlaces

Los enlaces públicos caducan por fecha o por número de descargas.

## Papelera

Los documentos eliminados se pueden restaurar. Solo la administración puede borrarlos definitivamente.

## Versiones

Cada reemplazo crea una versión nueva. Restaurar una versión anterior no borra el historial: añade una copia como versión actual.
`,
          'text/markdown',
        ),
        createdBy: 'u-elena',
        createdAt: ago(6),
      },
    ],
  });

  addFile({
    id: 'file-vacaciones',
    folderId: 'f-rrhh',
    name: 'Plantilla de vacaciones.csv',
    ownerId: 'u-elena',
    createdAt: ago(240),
    updatedAt: ago(240),
    versions: [
      {
        mimeType: 'text/csv',
        content: textBlob(
          `persona;dias;periodo;estado
Ana Torres;12;2026-07;Aprobado
Luis Prado;8;2026-08;Pendiente
Marta Gil;15;2026-09;Aprobado
`,
          'text/csv',
        ),
        createdBy: 'u-elena',
        createdAt: ago(240),
      },
    ],
  });

  addFile({
    id: 'file-acta',
    folderId: 'f-borradores',
    name: 'Acta de diciembre.md',
    ownerId: 'u-mateo',
    createdAt: ago(400),
    updatedAt: ago(400),
    deletedAt: ago(5),
    versions: [
      {
        mimeType: 'text/markdown',
        content: textBlob(
          `# Acta de diciembre

Se revisaron los expedientes del trimestre y se aprobó el cierre anual.

Pendiente: firmar el anexo de servicios en enero.
`,
          'text/markdown',
        ),
        createdBy: 'u-mateo',
        createdAt: ago(400),
      },
    ],
  });

  addFile({
    id: 'file-politica',
    folderId: null,
    name: 'Borrador de política.md',
    ownerId: 'u-elena',
    createdAt: ago(30),
    updatedAt: ago(30),
    deletedAt: ago(2),
    versions: [
      {
        mimeType: 'text/markdown',
        content: textBlob(
          `# Política de privacidad (borrador)

Los datos se conservan durante el tiempo necesario para la prestación del servicio.

El acceso está limitado a las cuentas con permiso de edición o administración.
`,
          'text/markdown',
        ),
        createdBy: 'u-elena',
        createdAt: ago(30),
      },
    ],
  });

  state.shares.push(
    {
      id: 'share-norte',
      fileId: 'file-contrato',
      token: DEMO_PUBLIC_TOKEN,
      expiresAt: ahead(30),
      maxDownloads: 12,
      downloadCount: 3,
      revokedAt: null,
      createdAt: ago(3),
      createdBy: 'u-elena',
    },
    {
      id: 'share-guia',
      fileId: 'file-guia',
      token: 'demo-guia-revoked-2026',
      expiresAt: null,
      maxDownloads: null,
      downloadCount: 7,
      revokedAt: ago(2, 5),
      createdAt: ago(20),
      createdBy: 'u-elena',
    },
    {
      id: 'share-manual',
      fileId: 'file-manual',
      token: 'demo-manual-expired-2026',
      expiresAt: ago(1),
      maxDownloads: 5,
      downloadCount: 2,
      revokedAt: null,
      createdAt: ago(15),
      createdBy: 'u-mateo',
    },
  );

  const addActivity = (
    id: string,
    userId: string | null,
    action: string,
    targetType: string,
    targetId: string | null,
    metadata: Record<string, unknown> | null,
    createdAt: string,
  ) => {
    state.activity.push({
      id: `act-${id}`,
      userId,
      action,
      targetType,
      targetId,
      metadata,
      createdAt,
    });
  };

  addActivity(
    '1',
    'u-mateo',
    'file.download',
    'file',
    'file-factura-014',
    { name: 'Factura 2026-014.csv' },
    ago(0, 2),
  );
  addActivity(
    '2',
    'u-elena',
    'file.version.restore',
    'file',
    'file-manual',
    { name: 'Manual de uso.md', from: 1, to: 3 },
    ago(0, 6),
  );
  addActivity(
    '3',
    'u-elena',
    'share.create',
    'share',
    'share-norte',
    { fileName: 'Contrato marco · Norte.pdf', maxDownloads: 12 },
    ago(1),
  );
  addActivity(
    '4',
    'u-mateo',
    'file.update',
    'file',
    'file-notas',
    { previousName: 'Notas.md', name: 'Notas de la semana.md' },
    ago(1, 4),
  );
  addActivity(
    '5',
    'u-elena',
    'file.delete',
    'file',
    'file-politica',
    { name: 'Borrador de política.md' },
    ago(2),
  );
  addActivity(
    '6',
    'u-elena',
    'share.revoke',
    'share',
    'share-guia',
    { fileId: 'file-guia' },
    ago(2, 5),
  );
  addActivity(
    '7',
    'u-mateo',
    'file.version.create',
    'file',
    'file-guia',
    { name: 'Guía de marca.pdf', version: 2 },
    ago(3),
  );
  addActivity(
    '8',
    'u-mateo',
    'folder.delete',
    'folder',
    'f-borradores',
    { name: 'Borradores 2025' },
    ago(5),
  );
  addActivity(
    '9',
    'u-elena',
    'file.version.create',
    'file',
    'file-manual',
    { name: 'Manual de uso.md', version: 3 },
    ago(6),
  );
  addActivity(
    '10',
    'u-elena',
    'user.create',
    'user',
    'u-sofia',
    { email: 'sofia@archivero.demo', role: 'viewer' },
    ago(9),
  );
  addActivity(
    '11',
    'u-elena',
    'folder.create',
    'folder',
    'f-manuales',
    { name: 'Manuales' },
    ago(12),
  );
  addActivity(
    '12',
    'u-mateo',
    'file.upload',
    'file',
    'file-factura-015',
    { name: 'Factura 2026-015.csv', size: 148, version: 1 },
    ago(15),
  );
  addActivity('13', 'u-sofia', 'session.login', 'session', 'u-sofia', null, ago(20));
  addActivity(
    '14',
    'u-elena',
    'folder.create',
    'folder',
    'f-rrhh',
    { name: 'Recursos Humanos' },
    ago(25),
  );
  addActivity(
    '15',
    'u-elena',
    'file.upload',
    'file',
    'file-guia',
    { name: 'Guía de marca.pdf', size: 180_000, version: 1 },
    ago(30),
  );
  addActivity(
    '16',
    null,
    'share.download',
    'share',
    'share-norte',
    { fileName: 'Contrato marco · Norte.pdf', downloadCount: 3, maxDownloads: 12 },
    ago(32),
  );
  addActivity('17', 'u-mateo', 'session.login', 'session', 'u-mateo', null, ago(40));

  return state;
}
