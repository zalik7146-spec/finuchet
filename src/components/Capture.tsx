import { useRef, useState, type DragEvent } from 'react';
import { validateFile } from '../lib/extract';

/** Добавление расхода: крупная зона для перетаскивания файла и рядом поле текстовой заметки. */
export function Capture({
  busy,
  onFile,
  onText,
  onManual,
  onInvalid,
}: {
  busy: boolean;
  onFile: (file: File) => void;
  onText: (text: string) => void;
  onManual: () => void;
  onInvalid: (message: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const take = (file: File | undefined) => {
    if (!file) return;
    const problem = validateFile(file);
    if (problem) onInvalid(problem);
    else onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!busy) take(e.dataTransfer.files[0]);
  };

  const submitText = () => {
    const t = text.trim();
    if (!t) return onInvalid('Введите текст расхода.');
    onText(t);
    setText('');
  };

  return (
    <section
      className="card grid gap-3 p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      aria-label="Добавление расхода"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={onDrop}
    >
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !busy) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
          over ? 'border-accent bg-blue-50' : 'border-slate-300 bg-slate-50/60 hover:border-accent hover:bg-blue-50/50'
        } ${busy ? 'cursor-wait opacity-60' : ''}`}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={over ? 'text-accent' : 'text-slate-400'} aria-hidden="true">
          <path d="M12 15V3M7 8l5-5 5 5" />
          <path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
        </svg>
        <span className="text-sm font-semibold text-ink">{over ? 'Отпустите, чтобы распознать' : 'Перетащите счёт или чек сюда'}</span>
        <span className="text-[13px] text-slate-500">
          или <span className="font-semibold text-accent">выберите файл</span> · PDF, JPG, PNG, WEBP, XLSX · до 15 МБ
        </span>
      </div>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept="application/pdf,image/jpeg,image/png,image/webp,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="quick-text" className="text-[13px] font-semibold text-slate-600">
          Или опишите расход текстом
        </label>
        <textarea
          id="quick-text"
          className="field flex-1"
          rows={2}
          maxLength={20000}
          placeholder="Оплата Яндекс Доставки 4 500 ₽ по накладной №128 от 14.11"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitText();
            }
          }}
        />
        <div className="flex items-center gap-3">
          <button className="btn" disabled={busy || !text.trim()} onClick={submitText}>
            Распознать
          </button>
          <span className="hidden text-xs text-slate-400 sm:inline">Enter — распознать, Shift+Enter — новая строка</span>
          <button className="link ml-auto" disabled={busy} onClick={onManual}>
            Добавить вручную
          </button>
        </div>
      </div>
    </section>
  );
}
