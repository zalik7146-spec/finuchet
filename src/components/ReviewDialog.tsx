import { useState } from 'react';
import type { Category, Draft } from '../types';
import { emptyDraft, newKey } from '../lib/extract';
import { CONFIDENCE_LABEL, SOURCE_LABEL, amountToInput, formatRub, isValidIsoDate, parseAmount } from '../lib/format';
import { Label, Modal } from './ui';

type Errors = Partial<Record<'vendor' | 'date' | 'amount' | 'categoryId', string>>;

function validate(d: Draft, categories: Category[]): Errors {
  const e: Errors = {};
  if (!d.vendor.trim()) e.vendor = 'Укажите контрагента';
  if (!isValidIsoDate(d.date)) e.date = 'Некорректная дата';
  const a = parseAmount(d.amount);
  if (!(a > 0)) e.amount = 'Сумма больше нуля, до копеек';
  if (!categories.some((c) => c.id === d.categoryId)) e.categoryId = 'Выберите направление';
  return e;
}

export function ReviewSkeleton({ onClose, source }: { onClose: () => void; source: string }) {
  return (
    <Modal title="Проверка распознанных расходов" subtitle={`ИИ читает: ${source}`} onClose={onClose}>
      <div className="px-5 py-5" aria-busy="true" aria-label="Идёт распознавание">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
          {['sm:col-span-3', 'sm:col-span-3', 'sm:col-span-2', 'sm:col-span-2', 'sm:col-span-2', 'col-span-2 sm:col-span-6'].map((span, i) => (
            <div key={i} className={span}>
              <div className="skeleton mb-2 h-3 w-24" />
              <div className="skeleton h-9 w-full" />
            </div>
          ))}
        </div>
        <div className="skeleton mt-5 h-3 w-64" />
      </div>
    </Modal>
  );
}

export function ReviewDialog({
  mode,
  initial,
  categories,
  onSave,
  onClose,
}: {
  mode: 'new' | 'edit';
  initial: Draft[];
  categories: Category[];
  onSave: (drafts: Draft[]) => Promise<void>;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = (key: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const remove = (key: string) => setDrafts((ds) => ds.filter((d) => d.key !== key));
  const add = () => setDrafts((ds) => [...ds, emptyDraft(categories[0]?.id ?? '')]);

  /** Делит позицию на две: сумма пополам, вторую часть можно отнести к другому направлению. */
  const split = (d: Draft) => {
    const total = parseAmount(d.amount);
    const first = total > 0 ? Math.floor((total / 2) * 100) / 100 : 0;
    const second = total > 0 ? Math.round((total - first) * 100) / 100 : 0;
    setDrafts((ds) =>
      ds.flatMap((x) =>
        x.key === d.key
          ? [
              { ...x, amount: total > 0 ? amountToInput(first) : x.amount },
              { ...x, key: newKey(), id: undefined, amount: total > 0 ? amountToInput(second) : '' },
            ]
          : [x],
      ),
    );
  };

  const errors = drafts.map((d) => validate(d, categories));
  const hasErrors = errors.some((e) => Object.keys(e).length > 0);
  const total = drafts.reduce((s, d) => s + (parseAmount(d.amount) || 0), 0);
  const attention = drafts.filter((d) => d.sourceType !== 'manual' && d.aiConfidence !== 'high').length;

  const save = async () => {
    setShowErrors(true);
    if (hasErrors || !drafts.length) return;
    setSaving(true);
    try {
      await onSave(drafts);
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'edit' ? 'Расход' : 'Проверка распознанных расходов';
  const subtitle =
    mode === 'edit'
      ? 'Изменения сохраняются в базу после подтверждения'
      : attention > 0
        ? `Проверьте поля перед сохранением · ${attention} ${attention === 1 ? 'позиция требует' : 'позиции требуют'} внимания`
        : 'Проверьте поля перед сохранением — в базу попадёт только подтверждённое';

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-sm text-slate-500">
            Итого <span className="num font-semibold text-ink">{formatRub(total)}</span>
            {drafts.length > 1 && ` · ${drafts.length} поз.`}
          </span>
          <button className="btn" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !drafts.length}>
            {saving ? 'Сохранение…' : mode === 'edit' ? 'Сохранить изменения' : 'Подтвердить и сохранить'}
          </button>
        </>
      }
    >
      {drafts.length === 0 && (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold">Расходы не найдены</p>
          <p className="mt-1 text-sm text-slate-500">ИИ не нашёл в документе сумм к оплате. Добавьте позицию вручную.</p>
        </div>
      )}

      {drafts.map((d, i) => {
        const err = showErrors ? errors[i] : {};
        const unsure = d.sourceType !== 'manual' && d.aiConfidence !== 'high';
        const state = (bad?: string, warnable = false) => (bad ? 'bad' : warnable && unsure ? 'warn' : undefined);
        return (
          <section key={d.key} className="border-b border-line px-5 py-5 last:border-b-0">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-6">
              <Label text="Контрагент" className="col-span-2 sm:col-span-3">
                <input className="field" data-state={state(err.vendor)} value={d.vendor} maxLength={120} onChange={(e) => patch(d.key, { vendor: e.target.value })} />
                {err.vendor && <span className="mt-1 block text-xs text-bad">{err.vendor}</span>}
              </Label>
              <Label text="Направление" className="col-span-2 sm:col-span-3">
                <select className="field" data-state={state(err.categoryId)} value={d.categoryId} onChange={(e) => patch(d.key, { categoryId: e.target.value })}>
                  {!categories.some((c) => c.id === d.categoryId) && <option value="">— выберите —</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {err.categoryId && <span className="mt-1 block text-xs text-bad">{err.categoryId}</span>}
              </Label>
              <Label text="Дата" className="sm:col-span-2">
                <input type="date" className="field num" data-state={state(err.date, true)} value={d.date} onChange={(e) => patch(d.key, { date: e.target.value })} />
                {err.date && <span className="mt-1 block text-xs text-bad">{err.date}</span>}
              </Label>
              <Label text="Сумма, ₽" className="sm:col-span-2">
                <input
                  className="field num text-right"
                  inputMode="decimal"
                  placeholder="0,00"
                  data-state={state(err.amount, true)}
                  value={d.amount}
                  onChange={(e) => patch(d.key, { amount: e.target.value })}
                />
                {err.amount && <span className="mt-1 block text-xs text-bad">{err.amount}</span>}
              </Label>
              <Label text="№ документа" className="col-span-2 sm:col-span-2">
                <input className="field num" value={d.documentNumber} maxLength={60} onChange={(e) => patch(d.key, { documentNumber: e.target.value })} />
              </Label>
              <Label text="Назначение / позиции" className="col-span-2 sm:col-span-6">
                <textarea className="field" rows={2} maxLength={500} value={d.description} onChange={(e) => patch(d.key, { description: e.target.value })} />
              </Label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500">
              <span className="min-w-0 truncate">
                {SOURCE_LABEL[d.sourceType]}
                {d.sourceFileName && ` · ${d.sourceFileName}`}
                {d.sourceType !== 'manual' && (
                  <>
                    {' · уверенность ИИ: '}
                    <span className={d.aiConfidence === 'high' ? 'font-semibold text-ok' : d.aiConfidence === 'medium' ? 'font-semibold text-warn' : 'font-semibold text-bad'}>
                      {CONFIDENCE_LABEL[d.aiConfidence]}
                    </span>
                  </>
                )}
              </span>
              <span className="ml-auto flex gap-4">
                {mode === 'new' && (
                  <>
                    <button className="link" onClick={() => split(d)}>
                      Разбить
                    </button>
                    <button className="link link-danger" onClick={() => remove(d.key)}>
                      Удалить строку
                    </button>
                  </>
                )}
              </span>
            </div>
          </section>
        );
      })}

      {mode === 'new' && (
        <div className="border-t border-line px-5 py-3">
          <button className="link" onClick={add} disabled={!categories.length}>
            + Добавить позицию вручную
          </button>
        </div>
      )}
    </Modal>
  );
}
