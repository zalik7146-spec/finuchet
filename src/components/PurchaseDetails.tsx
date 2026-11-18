import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DataStore, PlannedPurchase, PlannedPurchaseInput, PurchaseComment } from '../types';
import { isValidIsoDate, todayIso, toIso } from '../lib/format';
import { purchaseKey, purchaseLabels } from '../lib/purchasePlanner';
import { describeError } from '../lib/supabase';
import type { PlannerActions } from './Planner';
import { Confirm, Label } from './ui';

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 32;
const commentDate = new Intl.DateTimeFormat('ru', { dateStyle: 'short', timeStyle: 'short' });
type Fields = { title: string; group: string; tags: string; dueDate: string };

export function PurchaseDetails({ item, groups, tags, store, run, onBack }: Pick<PlannerActions, 'run'> & {
  item: PlannedPurchase;
  groups: string[];
  tags: string[];
  store: DataStore;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<Partial<Fields>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { backButton.current?.focus(); }, []);

  const title = draft.title ?? item.title;
  const group = draft.group ?? item.group;
  const tagText = draft.tags ?? item.tags.join(', ');
  const dueDate = draft.dueDate ?? item.dueDate ?? '';
  const currentTags = purchaseLabels(tagText.split(','));
  const suggestedTags = tags.filter((tag) => !currentTags.some((value) => purchaseKey(value) === purchaseKey(tag))).slice(0, 6);

  const update = (field: keyof Fields, value: string) => {
    setError('');
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const patch: Partial<PlannedPurchaseInput> = {};
  if (title.trim() !== item.title) patch.title = title.trim();
  const groupName = groups.find((name) => purchaseKey(name) === purchaseKey(group)) ?? group.trim();
  if (draft.group !== undefined && groupName !== item.group) patch.group = groupName;
  if (currentTags.join(', ') !== item.tags.join(', ')) {
    patch.tags = currentTags.map((tag) => tags.find((name) => purchaseKey(name) === purchaseKey(tag)) ?? tag);
  }
  if ((dueDate || null) !== item.dueDate) patch.dueDate = dueDate || null;
  const dirty = Object.keys(patch).length > 0;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    if (!title.trim()) return setError('Введите название покупки.');
    if (dueDate && !isValidIsoDate(dueDate)) return setError('Укажите корректную дату заказа.');
    if (currentTags.length > MAX_TAGS || currentTags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
      return setError(`Можно добавить до ${MAX_TAGS} меток, не длиннее ${MAX_TAG_LENGTH} символов каждая.`);
    }
    setSaving(true);
    try {
      if (await run(() => store.updatePlannedPurchase(item.id, patch), 'Покупка сохранена.')) setDraft({});
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setConfirm(null);
    setSaving(true);
    try {
      if (await run(() => store.deletePlannedPurchase(item.id), 'Покупка удалена.')) onBack();
    } finally {
      setSaving(false);
    }
  }

  function setDate(offset: number) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    update('dueDate', toIso(date));
  }

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <button ref={backButton} type="button" className="btn" disabled={saving}
          onClick={() => dirty ? setConfirm('leave') : onBack()}>← К списку</button>
        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${item.ordered ? 'bg-emerald-50 text-ok' : 'bg-slate-100 text-slate-700'}`}>
          {item.ordered ? 'Заказано' : 'К заказу'}
        </span>
      </header>
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <form className="min-w-0 space-y-4 p-4 sm:p-5" onSubmit={save}>
          <h2 className="text-lg font-bold tracking-tight wrap-break-word">{item.title}</h2>
          <fieldset disabled={saving} className="min-w-0 space-y-3">
            <Label text="Название покупки">
              <input className="field max-sm:text-base" maxLength={200} required value={title}
                onChange={(event) => update('title', event.target.value)} />
            </Label>
            <Label text="Группа">
              <input className="field max-sm:text-base" list="purchase-group-options" placeholder="Например, Упаковка" maxLength={64}
                value={group} onChange={(event) => update('group', event.target.value)} />
              <datalist id="purchase-group-options">{groups.map((name) => <option key={name} value={name} />)}</datalist>
            </Label>
            <div>
              <Label text="Метки">
                <input className="field max-sm:text-base" placeholder="Срочно, самовывоз" maxLength={360} aria-describedby="purchase-tag-help"
                  value={tagText} onChange={(event) => update('tags', event.target.value)} />
              </Label>
              <p id="purchase-tag-help" className="mt-1 text-xs text-slate-500">Разделяйте метки запятыми.</p>
              {suggestedTags.length > 0 && currentTags.length < MAX_TAGS && (
                <div role="group" aria-label="Использованные метки" className="mt-1.5 flex flex-wrap gap-1.5">
                  {suggestedTags.map((tag) => (
                    <button key={tag} type="button" className="btn !h-auto min-h-7 !whitespace-normal !px-2 !text-xs"
                      onClick={() => update('tags', [...currentTags, tag].join(', '))}>+ {tag}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <Label text="Заказать к дате">
                <input className="field max-sm:text-base" type="date" value={dueDate} onChange={(event) => update('dueDate', event.target.value)} />
              </Label>
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Быстрый выбор даты заказа">
                <button type="button" className="btn !h-8 !px-2.5 !text-xs" aria-pressed={dueDate === todayIso()} onClick={() => setDate(0)}>Сегодня</button>
                <button type="button" className="btn !h-8 !px-2.5 !text-xs" onClick={() => setDate(1)}>Завтра</button>
                {dueDate && <button type="button" className="btn !h-8 !px-2.5 !text-xs" onClick={() => update('dueDate', '')}>Убрать дату</button>}
              </div>
            </div>
          </fieldset>
          {error && <p className="text-sm text-bad" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button className="btn btn-primary" disabled={saving || !dirty}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
            <button type="button" className="btn !text-bad" disabled={saving} onClick={() => setConfirm('delete')}>Удалить покупку</button>
          </div>
        </form>
        <PurchaseComments purchaseId={item.id} store={store} run={run} />
      </div>
      {confirm === 'delete' && (
        <Confirm title="Удалить покупку?" text="Покупка и её комментарии будут удалены."
          confirmLabel="Удалить" onCancel={() => setConfirm(null)} onConfirm={() => void remove()} />
      )}
      {confirm === 'leave' && (
        <Confirm title="Закрыть без сохранения?" text="Изменения в карточке покупки будут потеряны."
          confirmLabel="Закрыть" onCancel={() => setConfirm(null)} onConfirm={onBack} />
      )}
    </article>
  );
}

function PurchaseComments({ purchaseId, store, run }: Pick<PlannerActions, 'run'> & { purchaseId: string; store: DataStore }) {
  const [comments, setComments] = useState<PurchaseComment[] | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const composer = useRef<HTMLTextAreaElement>(null);

  function append(incoming: PurchaseComment[]) {
    setComments((current) => {
      const byId = new Map((current ?? []).map((comment) => [comment.id, comment]));
      incoming.forEach((comment) => byId.set(comment.id, comment));
      return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    });
  }

  useEffect(() => store.subscribePurchaseComments(purchaseId, (incoming) => {
    append(incoming);
    setError('');
  }, (failure) => setError(describeError(failure))), [store, purchaseId, attempt]);

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (posting || !body.trim()) return;
    setPosting(true);
    try {
      if (await run(async () => append([await store.addPurchaseComment(purchaseId, body.trim())]))) setBody('');
    } finally {
      setPosting(false);
      composer.current?.focus();
    }
  }

  return (
    <section className="min-w-0 space-y-3 border-t border-line bg-slate-50 p-4 sm:p-5 lg:border-t-0 lg:border-l" aria-label="Комментарии">
      <h2 className="text-base font-bold">Комментарии</h2>
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-bad">{error}</p>
          <button type="button" className="btn" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Повторить загрузку</button>
        </div>
      )}
      {!comments && !error && <p className="text-sm text-slate-500" role="status">Загружаем комментарии…</p>}
      {comments?.length === 0 && <p className="text-sm text-slate-500">Комментариев пока нет.</p>}
      {comments && comments.length > 0 && (
        <ol className="space-y-2" aria-live="polite">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-md border border-line bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs text-slate-600">
                <span className="min-w-0 font-semibold text-ink wrap-break-word">{comment.author}</span>
                <time dateTime={new Date(comment.createdAt).toISOString()} className="num">{commentDate.format(comment.createdAt)}</time>
              </div>
              <p className="mt-1.5 text-sm whitespace-pre-wrap wrap-break-word">{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={post} className="space-y-2">
        <Label text="Новый комментарий">
          <textarea ref={composer} className="field max-sm:text-base" rows={3} maxLength={2000} value={body}
            onChange={(event) => setBody(event.target.value)} readOnly={posting} />
        </Label>
        <button className="btn" disabled={posting || !body.trim()}>{posting ? 'Отправляем…' : 'Добавить комментарий'}</button>
      </form>
    </section>
  );
}
