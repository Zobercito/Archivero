import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastTone = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; tone: ToastTone };

type ToastValue = {
  notify: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastValue | null>(null);

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const tones: Record<ToastTone, string> = {
  success: 'border-l-moss text-ink',
  error: 'border-l-danger text-ink',
  info: 'border-l-terracotta text-ink',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      counter.current += 1;
      const id = counter.current;
      setItems((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[120] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {items.map((item) => {
          const Icon = icons[item.tone];
          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 border border-rule border-l-4 bg-paper-light px-4 py-3 shadow-[0_18px_40px_-24px_rgba(28,25,23,.55)] ${tones[item.tone]}`}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="flex-1 text-sm leading-snug">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="text-ink-faint transition hover:text-ink"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
