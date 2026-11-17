import { useEffect, useRef, useState } from 'react';
import type { Category, Filter, PeriodPreset } from '../types';
import { PRESET_LABEL } from '../lib/filters';

const PRESETS: PeriodPreset[] = ['thisMonth', 'lastMonth', 'quarter', 'year', 'all', 'custom'];

export function FilterBar({
  filter,
  categories,
  onChange,
}: {
  filter: Filter;
  categories: Category[];
  onChange: (f: Filter) => void;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const toggleCat = (id: string) =>
    onChange({
      ...filter,
      categoryIds: filter.categoryIds.includes(id) ? filter.categoryIds.filter((x) => x !== id) : [...filter.categoryIds, id],
    });

  const selected = filter.categoryIds.length;
  const active = selected > 0 || filter.search.trim() !== '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap rounded-md border border-line bg-white p-0.5" role="group" aria-label="Период">
        {PRESETS.map((p) => (
          <button
            key={p}
            aria-pressed={filter.preset === p}
            onClick={() => onChange({ ...filter, preset: p })}
            className={`h-8 rounded px-3 text-[13px] font-semibold ${filter.preset === p ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {PRESET_LABEL[p]}
          </button>
        ))}
      </div>

      {filter.preset === 'custom' && (
        <div className="flex items-center gap-1.5 text-[13px] text-slate-500">
          <input type="date" aria-label="Дата от" className="field num !w-[150px]" value={filter.from} max={filter.to || undefined} onChange={(e) => onChange({ ...filter, from: e.target.value })} />
          —
          <input type="date" aria-label="Дата до" className="field num !w-[150px]" value={filter.to} min={filter.from || undefined} onChange={(e) => onChange({ ...filter, to: e.target.value })} />
        </div>
      )}

      <div className="relative" ref={menu}>
        <button className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {selected ? `Направления: ${selected}` : 'Все направления'}
        </button>
        {open && (
          <div className="card absolute top-10 left-0 z-20 max-h-72 w-64 overflow-y-auto p-1.5">
            {categories.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="accent-[#2563EB]" checked={filter.categoryIds.includes(c.id)} onChange={() => toggleCat(c.id)} />
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <input
        type="search"
        className="field !w-56"
        placeholder="Поиск по контрагенту"
        aria-label="Поиск по контрагенту"
        value={filter.search}
        onChange={(e) => onChange({ ...filter, search: e.target.value })}
      />

      {active && (
        <button className="link" onClick={() => onChange({ ...filter, categoryIds: [], search: '' })}>
          Сбросить
        </button>
      )}
    </div>
  );
}
