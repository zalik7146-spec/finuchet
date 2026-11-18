import { useRef, useState, type FormEvent } from 'react';
import type { DataStore, PlannedPurchase } from '../types';
import { formatDate, todayIso } from '../lib/format';
import { groupPurchases, inPurchaseView, purchaseKey, purchaseLabels, PURCHASE_VIEWS, type PurchaseView } from '../lib/purchasePlanner';
import type { PlannerActions } from './Planner';
import { PurchaseDetails } from './PurchaseDetails';

export function BuyList({ items, store, run }: Pick<PlannerActions, 'run'> & { items: PlannedPurchase[]; store: DataStore }) {
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [tag, setTag] = useState('');
  const [view, setView] = useState<PurchaseView>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const quickAdd = useRef<HTMLInputElement>(null);

  const today = todayIso();
  const groupOptions = purchaseLabels(items.map((item) => item.group)).sort((a, b) => a.localeCompare(b, 'ru'));
  const tagOptions = purchaseLabels(items.flatMap((item) => item.tags)).sort((a, b) => a.localeCompare(b, 'ru'));
  const selectedGroup = groupOptions.find((name) => `group:${purchaseKey(name)}` === group) ?? '';
  const selectedTag = tagOptions.find((name) => purchaseKey(name) === tag) ?? '';
  const selected = items.find((item) => item.id === selectedId);
  const search = purchaseKey(query);
  const matching = items.filter((item) =>
    (group === 'ungrouped' ? !item.group : !selectedGroup || purchaseKey(item.group) === purchaseKey(selectedGroup))
    && (!selectedTag || item.tags.some((name) => purchaseKey(name) === tag))
    && (!search || [item.title, item.group, ...item.tags].some((name) => purchaseKey(name).includes(search))),
  );
  const visible = matching.filter((item) => inPurchaseView(item, view, today));
  const visibleByDate = view === 'ordered' ? visible : visible.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const sections = groupPurchases(visibleByDate);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adding || !title.trim()) return;
    setAdding(true);
    try {
      if (await run(() => store.addPlannedPurchase({
        title: title.trim(),
        group: selectedGroup,
        tags: selectedTag ? [selectedTag] : [],
        dueDate: view === 'today' ? today : null,
      }))) {
        setTitle('');
        setQuery('');
        if (view === 'ordered' || view === 'upcoming') setView('active');
      }
    } finally {
      setAdding(false);
      quickAdd.current?.focus();
    }
  }

  async function toggle(item: PlannedPurchase, ordered: boolean) {
    setUpdating(item.id);
    try {
      if (await run(() => store.updatePlannedPurchase(item.id, { ordered }))) {
        document.getElementById(`purchase-view-${view}`)?.focus();
      }
    } finally {
      setUpdating(null);
    }
  }

  function closeDetails() {
    setSelectedId(null);
    requestAnimationFrame(() => {
      const row = document.getElementById(`purchase-${selectedId}`);
      (row ?? document.getElementById(`purchase-view-${view}`))?.focus();
    });
  }

  const filtered = Boolean(search || selectedGroup || group === 'ungrouped' || selectedTag);

  return selected ? (
    <PurchaseDetails key={selected.id} item={selected} groups={groupOptions} tags={tagOptions}
      store={store} run={run} onBack={closeDetails} />
  ) : (
    <div className="card overflow-hidden">
      <div className="border-b border-line p-4 sm:p-5">
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <label className="block min-w-0 flex-1">
            <span className="sr-only">Что нужно купить?</span>
            <input ref={quickAdd} className="field max-sm:text-base" placeholder="Что нужно купить?" maxLength={200}
              value={title} onChange={(event) => setTitle(event.target.value)} readOnly={adding} />
          </label>
          <button className="btn btn-primary" disabled={adding || !title.trim()}>{adding ? 'Добавляем…' : 'Добавить'}</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Списки покупок">
          {PURCHASE_VIEWS.map(([key, label]) => {
            const count = matching.filter((item) => inPurchaseView(item, key, today)).length;
            return (
              <button key={key} id={`purchase-view-${key}`} type="button" aria-pressed={view === key} onClick={() => setView(key)}
                className={`btn !h-9 !px-2.5 ${view === key ? '!border-blue-200 !bg-blue-50 !text-accent' : '!border-transparent !text-slate-600'}`}>
                {label} <span aria-hidden="true" className="num text-xs opacity-75">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-line bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_150px_150px_auto] sm:px-5">
        <input type="search" className="field col-span-2 min-w-0 max-sm:text-base sm:col-span-1" aria-label="Поиск покупок"
          placeholder="Поиск по списку" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="field min-w-0 max-sm:text-base" aria-label="Фильтр по группе" value={selectedGroup || group === 'ungrouped' ? group : ''}
          onChange={(event) => setGroup(event.target.value)}>
          <option value="">Все группы</option>
          <option value="ungrouped">Без группы</option>
          {groupOptions.map((name) => <option key={purchaseKey(name)} value={`group:${purchaseKey(name)}`}>{name}</option>)}
        </select>
        <select className="field min-w-0 max-sm:text-base" aria-label="Фильтр по метке" value={selectedTag ? tag : ''}
          onChange={(event) => setTag(event.target.value)}>
          <option value="">Все метки</option>
          {tagOptions.map((name) => <option key={purchaseKey(name)} value={purchaseKey(name)}>{name}</option>)}
        </select>
        {filtered && (
          <button className="btn col-span-2 sm:col-span-1" onClick={() => { setGroup(''); setTag(''); setQuery(''); }}>Сбросить</button>
        )}
      </div>

      <div className="px-4 pb-1 sm:px-5">
        {!sections.length && (
          <p className="py-6 text-sm text-slate-500">{filtered ? 'Ничего не найдено.' : 'В этом списке пока нет покупок.'}</p>
        )}
        {sections.map(([key, section]) => (
          <section key={key} className="border-b border-line py-4 last:border-b-0">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-bold wrap-break-word">
              <span className="min-w-0">{section.label || 'Без группы'}</span>
              <span className="num text-xs font-medium text-slate-500">{section.items.length}</span>
            </h2>
            <ul className="divide-y divide-line">
              {section.items.map((item) => (
                <li key={item.id} className="flex min-w-0 items-start gap-2">
                  <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center">
                    <input type="checkbox" className="size-5 accent-accent" aria-label={`Заказано: ${item.title}`}
                      checked={item.ordered} disabled={updating !== null}
                      onChange={(event) => void toggle(item, event.target.checked)} />
                  </label>
                  <button id={`purchase-${item.id}`} type="button"
                    className="flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => setSelectedId(item.id)}>
                    <span className={`min-w-0 grow basis-48 text-sm font-semibold wrap-break-word ${item.ordered ? 'text-slate-500 line-through' : 'text-ink'}`}>{item.title}</span>
                    {item.dueDate && (
                      <span className={`num text-xs ${!item.ordered && item.dueDate < today ? 'font-semibold text-bad' : 'text-slate-600'}`}>
                        {!item.ordered && item.dueDate < today && 'Просрочено · '}{formatDate(item.dueDate)}
                      </span>
                    )}
                    {item.tags.length > 0 && (
                      <span className="flex min-w-0 flex-wrap gap-1">
                        {item.tags.map((name) => <span key={name} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 wrap-break-word">{name}</span>)}
                      </span>
                    )}
                    <span aria-hidden="true" className="ml-auto shrink-0 text-slate-500">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
