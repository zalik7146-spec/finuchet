import { useEffect, useRef, useState } from 'react';
import type { Category, Filter, PeriodPreset } from '../types';
import { PRESET_LABEL, periodLabel } from '../lib/filters';
import { IconCalendar, IconChevronDown } from './icons';

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
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!periodOpen) return;
    const close = (e: MouseEvent) => {
      if (!periodMenu.current?.contains(e.target as Node)) setPeriodOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPeriodOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [periodOpen]);

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
      <div className="relative" ref={periodMenu}>
        <button className="btn gap-2" aria-expanded={periodOpen} aria-haspopup="true" onClick={() => setPeriodOpen((o) => !o)}>
          <IconCalendar className="text-slate-500" />
          <span>{PRESET_LABEL[filter.preset]}</span>
          <span className="num hidden text-xs font-normal text-slate-500 sm:inline">{periodLabel(filter)}</span>
          <IconChevronDown className="text-slate-400" />
        </button>
        {periodOpen && (
          <div className="card absolute top-10 left-0 z-20 w-64 p-1.5" role="menu" aria-label="Период">
            {PRESETS.map((p) => (
              <button
                key={p}
                role="menuitemradio"
                aria-checked={filter.preset === p}
                onClick={() => {
                  onChange({ ...filter, preset: p });
                  if (p !== 'custom') setPeriodOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${filter.preset === p ? 'font-semibold text-ink' : 'text-slate-600'}`}
              >
                {PRESET_LABEL[p]}
                {filter.preset === p && <span className="text-accent">✓</span>}
              </button>
            ))}
            {filter.preset === 'custom' && (
              <div className="mt-1 grid grid-cols-2 gap-1.5 border-t border-line px-1 pt-2 pb-1">
                <input type="date" aria-label="Дата от" className="field num !h-8 !px-1.5 text-xs" value={filter.from} max={filter.to || undefined} onChange={(e) => onChange({ ...filter, from: e.target.value })} />
                <input type="date" aria-label="Дата до" className="field num !h-8 !px-1.5 text-xs" value={filter.to} min={filter.from || undefined} onChange={(e) => onChange({ ...filter, to: e.target.value })} />
              </div>
            )}
          </div>
        )}
      </div>

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
