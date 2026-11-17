import { useEffect, type ReactNode } from 'react';

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 'max-w-3xl',
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[92vh] w-full ${width} flex-col rounded-t-xl border border-line bg-white sm:rounded-xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
          </div>
          <button className="link shrink-0 text-slate-500" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Confirm({
  title,
  text,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  text: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      width="max-w-md"
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Отмена
          </button>
          <button className="btn btn-danger" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="px-5 py-4 text-sm text-slate-600">{text}</p>
    </Modal>
  );
}

export interface Toast {
  id: number;
  kind: 'ok' | 'error';
  text: string;
}

export function Toasts({ items, onDismiss }: { items: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="card flex items-start gap-3 px-4 py-3 text-sm" role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className={`font-bold ${t.kind === 'error' ? 'text-bad' : 'text-ok'}`}>{t.kind === 'error' ? 'Ошибка' : 'Готово'}</span>
          <span className="min-w-0 flex-1 text-slate-700">{t.text}</span>
          <button className="link text-slate-400" onClick={() => onDismiss(t.id)} aria-label="Скрыть уведомление">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Label({ text, children, className = '' }: { text: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-500">{text}</span>
      {children}
    </label>
  );
}
