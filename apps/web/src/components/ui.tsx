import { Loader2, MoreHorizontal, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} aria-hidden />;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'border-ink bg-ink text-paper hover:border-terracotta-dark hover:bg-terracotta-dark',
  secondary:
    'border-rule bg-paper-light text-ink hover:border-rule-strong hover:bg-paper-deep/60',
  ghost:
    'border-transparent bg-transparent text-ink-soft hover:border-rule hover:bg-paper-light hover:text-ink',
  danger:
    'border-danger/30 bg-danger-soft text-danger hover:border-danger hover:bg-danger hover:text-paper',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-2.5 py-1.5 text-xs',
  md: 'gap-2 px-4 py-2.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-[2px] border font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-[2px] border border-transparent text-ink-faint transition hover:border-rule hover:bg-paper-light hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('field-input', className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('field-input', className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const modalSizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof modalSizes;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-ink/45 px-0 py-0 backdrop-blur-[2px] sm:items-center sm:px-6 sm:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'animate-enter max-h-[92vh] w-full overflow-y-auto border border-rule bg-paper-light shadow-[0_40px_90px_-40px_rgba(28,25,23,.65)]',
          modalSizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4 sm:px-6">
          <div>
            {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
            <h2 id={titleId} className="display text-xl sm:text-2xl">
              {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="mt-1 text-ink-faint transition hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-rule bg-paper/60 px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center border border-dashed border-rule-strong/70 bg-paper-light/60 px-6 py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center border border-rule bg-paper text-ink-soft">
        {icon}
      </div>
      <h3 className="display text-xl">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function ActionMenu({
  label,
  items,
  align = 'right',
}: {
  label: string;
  items: MenuItem[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      className="relative"
      ref={ref}
      onClick={(event) => event.stopPropagation()}
    >
      <IconButton
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="size-4" />
      </IconButton>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-50 mt-1 w-56 border border-rule bg-paper-light py-1 shadow-[0_24px_50px_-28px_rgba(28,25,23,.6)]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40',
                item.danger
                  ? 'text-danger hover:bg-danger-soft'
                  : 'text-ink-soft hover:bg-paper-deep/60 hover:text-ink',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'danger' | 'accent';
}) {
  const tones = {
    neutral: 'border-rule bg-paper-deep/60 text-ink-soft',
    success: 'border-moss/30 bg-moss-soft text-moss',
    danger: 'border-danger/30 bg-danger-soft text-danger',
    accent: 'border-terracotta/30 bg-terracotta-soft text-terracotta-dark',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em]',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
