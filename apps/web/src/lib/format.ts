export function formatBytes(bytes: number | null | undefined, locale: string) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 10 || index === 0 ? 0 : 1,
  }).format(value)} ${units[index]}`;
}

export function formatDate(
  iso: string | null | undefined,
  locale: string,
  withTime = false,
) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(new Date(iso));
}

export function formatLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function fileKind(mimeType: string | null, name: string) {
  const mime = mimeType ?? '';
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (mime.includes('spreadsheet') || extension === 'csv' || extension === 'xlsx') {
    return 'sheet';
  }
  if (mime.includes('presentation') || extension === 'pptx') return 'slide';
  if (mime.includes('zip') || extension === 'zip') return 'archive';
  if (mime.startsWith('text/')) return 'text';
  return 'file';
}

export function isEditor(role: string | undefined) {
  return role === 'admin' || role === 'editor';
}

export function isAdmin(role: string | undefined) {
  return role === 'admin';
}
