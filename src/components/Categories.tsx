import { useMemo, useState } from 'react';
import type { Category, Expense } from '../types';
import { PALETTE } from '../lib/defaults';
import { amountToInput, formatRub, parseAmount, todayIso } from '../lib/format';
import { Label, Modal } from './ui';

interface FormState {
  id?: string;
  name: string;
  color: string;
  budget: string;
}

export function Categories({
  categories,
  expenses,
  onSave,
  onDelete,
}: {
  categories: Category[];
  expenses: Expense[];
  onSave: (data: { id?: string; name: string; color: string; monthlyBudget: number | null }) => Promise<boolean>;
  onDelete: (c: Category) => void;
}) {
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  /** Расход за текущий месяц и число заявок за всё время по каждому направлению. */
  const stats = useMemo(() => {
    const month = todayIso().slice(0, 7);
    const m = new Map<string, { spent: number; count: number }>();
    for (const e of expenses) {
      const s = m.get(e.categoryId) ?? { spent: 0, count: 0 };
      s.count += 1;
      if (e.date.startsWith(month)) s.spent += e.amount;
      m.set(e.categoryId, s);
    }
    return m;
  }, [expenses]);

  const submit = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return setError('Введите название направления.');
    if (categories.some((c) => c.id !== form.id && c.name.toLowerCase() === name.toLowerCase())) {
      return setError('Направление с таким названием уже есть.');
    }
    let monthlyBudget: number | null = null;
    if (form.budget.trim()) {
      monthlyBudget = parseAmount(form.budget);
      if (!(monthlyBudget >= 0)) return setError('Лимит — неотрицательное число, например 50 000.');
    }
    setSaving(true);
    try {
      if (await onSave({ id: form.id, name, color: form.color, monthlyBudget })) setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const open = (c?: Category) => {
    setError('');
    setForm(
      c
        ? { id: c.id, name: c.name, color: c.color, budget: c.monthlyBudget == null ? '' : amountToInput(c.monthlyBudget) }
        : { name: '', color: PALETTE[categories.length % PALETTE.length], budget: '' },
    );
  };

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">Направления расходов</h2>
          <p className="text-xs text-slate-500">Лимит сравнивается с расходом за текущий месяц</p>
        </div>
        <button className="btn" onClick={() => open()}>
          Добавить направление
        </button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-2 font-semibold">Название</th>
              <th className="w-44 px-4 py-2 text-right font-semibold">Расход за месяц</th>
              <th className="w-44 px-4 py-2 text-right font-semibold">Лимит в месяц</th>
              <th className="w-48 px-4 py-2 font-semibold">Статус</th>
              <th className="w-44 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const s = stats.get(c.id) ?? { spent: 0, count: 0 };
              const ratio = c.monthlyBudget ? s.spent / c.monthlyBudget : null;
              const status =
                c.monthlyBudget == null
                  ? { text: 'Лимит не задан', cls: 'text-slate-400' }
                  : s.spent > c.monthlyBudget
                    ? { text: `Превышение на ${formatRub(s.spent - c.monthlyBudget)}`, cls: 'text-bad font-semibold' }
                    : ratio !== null && ratio >= 0.8
                      ? { text: `Близко к лимиту · ${Math.round(ratio * 100)}%`, cls: 'text-warn font-semibold' }
                      : { text: `В пределах лимита · ${Math.round((ratio ?? 0) * 100)}%`, cls: 'text-ok font-semibold' };
              return (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.color }} />
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-slate-400">
                        {c.isDefault ? 'базовое' : 'своё'} · {s.count} заяв.
                      </span>
                    </span>
                  </td>
                  <td className="num px-4 py-2.5 text-right">{formatRub(s.spent)}</td>
                  <td className="num px-4 py-2.5 text-right">{c.monthlyBudget == null ? '—' : formatRub(c.monthlyBudget)}</td>
                  <td className={`px-4 py-2.5 text-[13px] ${status.cls}`}>{status.text}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button className="link mr-3" onClick={() => open(c)}>
                      Изменить
                    </button>
                    <button className="link link-danger" onClick={() => onDelete(c)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal
          title={form.id ? 'Изменить направление' : 'Новое направление'}
          width="max-w-md"
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setForm(null)} disabled={saving}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-4 px-5 py-4">
            <Label text="Название">
              <input className="field" autoFocus maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Label>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-500">Цветовой маркер</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цветовой маркер">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    role="radio"
                    aria-checked={form.color === color}
                    aria-label={color}
                    onClick={() => setForm({ ...form, color })}
                    className={`h-7 w-7 rounded-md border-2 ${form.color === color ? 'border-ink' : 'border-white'}`}
                    style={{ background: color, boxShadow: '0 0 0 1px #E2E8F0' }}
                  />
                ))}
              </div>
            </div>
            <Label text="Лимит в месяц, ₽ (необязательно)">
              <input className="field num text-right" inputMode="decimal" placeholder="без лимита" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </Label>
            {error && <p className="text-[13px] text-bad">{error}</p>}
          </div>
        </Modal>
      )}
    </section>
  );
}
