import { useRef, useState, type DragEvent } from 'react';
import { validateFile } from '../lib/extract';

/** Компактная полоса добавления расхода: файл (кнопкой или перетаскиванием на всю полосу), заметка, ручной ввод. */
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
      className={`card relative flex flex-col gap-3 p-3 transition-colors sm:flex-row sm:items-center ${over ? 'border-accent bg-blue-50' : ''}`}
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
      <button className="btn btn-primary shrink-0" disabled={busy} onClick={() => input.current?.click()}>
        Загрузить счёт или чек
      </button>
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
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <label htmlFor="quick-text" className="sr-only">
          Текстовая заметка о расходе
        </label>
        <input
          id="quick-text"
          className="field min-w-0 flex-1"
          maxLength={20000}
          placeholder="…или опишите расход: «Оплата Яндекс Доставки 4 500 ₽ по накладной №128 от 14.11»"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitText();
          }}
        />
        <button className="btn shrink-0" disabled={busy || !text.trim()} onClick={submitText}>
          Распознать
        </button>
      </div>
      <button className="link shrink-0 self-start sm:self-center" disabled={busy} onClick={onManual}>
        Вручную
      </button>
      {over && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-blue-50/90 text-sm font-semibold text-accent">
          Отпустите файл — PDF, JPG, PNG, WEBP или XLSX до 15 МБ
        </div>
      )}
    </section>
  );
}
