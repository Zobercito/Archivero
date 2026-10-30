import { useI18n } from '../i18n';
import type { Role } from '../lib/types';

const styles: Record<Role, string> = {
  admin: 'border-terracotta/40 bg-terracotta-soft text-terracotta-dark',
  editor: 'border-moss/30 bg-moss-soft text-moss',
  viewer: 'border-rule bg-paper-deep/70 text-ink-soft',
};

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] ${styles[role]}`}
    >
      {t(`users.role.${role}`)}
    </span>
  );
}
