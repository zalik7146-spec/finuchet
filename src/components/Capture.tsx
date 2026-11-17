import { useRef, useState, type DragEvent } from 'react';
import { validateFile } from '../lib/extract';

/** Зона быстрой загрузки документа и поле текстового ввода. */
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
    <section className="card grid gap-0 md:grid-cols-2" aria-label="Добавление расхода">
      <div
        className={`flex flex-col items-start justify-center gap-2 rounded-l-lg border-b border-line p-5 md:border-r md:border-b-0 ${over ? 'bg-blue-50' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <h2 className="text-sm font-bold">Документ</h2>
        <p className="text-[13px] text-slate-500">Перетащите сюда счёт или чек · PDF, JPG, PNG, WEBP, XLSX · до 15 МБ</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <button className="btn" disabled={busy} onClick={() => input.current?.click()}>
            Выбрать файл
          </button>
          <button className="link" disabled={busy} onClick={onManual}>
            Добавить вручную
          </button>
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
      </div>
      <div className="flex flex-col gap-2 p-5">
        <label htmlFor="quick-text" className="text-sm font-bold">
          Текстовая заметка
        </label>
        <textarea
          id="quick-text"
          className="field"
          rows={2}
          maxLength={20000}
          placeholder="Оплата Яндекс Доставки 4 500 ₽ по накладной №128 от 14.11"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitText();
          }}
        />
        <div className="flex items-center gap-3">
          <button className="btn" disabled={busy || !text.trim()} onClick={submitText}>
            Распознать
          </button>
          <span className="text-xs text-slate-400">Ctrl + Enter</span>
        </div>
      </div>
    </section>
  );
}
