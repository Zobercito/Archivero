import {
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
  Presentation,
} from 'lucide-react';
import { fileKind } from '../lib/format';
import { cn } from './ui';

const kinds: Record<string, { icon: LucideIcon; tone: string }> = {
  pdf: { icon: FileText, tone: 'text-terracotta' },
  image: { icon: FileImage, tone: 'text-moss' },
  sheet: { icon: FileSpreadsheet, tone: 'text-moss' },
  slide: { icon: Presentation, tone: 'text-terracotta-dark' },
  archive: { icon: FileArchive, tone: 'text-ink-soft' },
  text: { icon: FileText, tone: 'text-ink-soft' },
  file: { icon: File, tone: 'text-ink-faint' },
};

export function FileIcon({
  name,
  mimeType,
  size = 'md',
  className,
}: {
  name: string;
  mimeType: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const kind = kinds[fileKind(mimeType, name)] ?? kinds.file;
  const Icon = kind?.icon ?? File;
  const box = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-9';
  const glyph = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-5' : 'size-4.5';
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center border border-rule bg-paper',
        kind?.tone,
        box,
        className,
      )}
    >
      <Icon className={glyph} aria-hidden />
    </span>
  );
}
