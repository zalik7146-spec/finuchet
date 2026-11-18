import { useRef, useState, type FormEvent } from 'react';
import type { DataStore, Trip, TripInput, TripStop } from '../types';
import { formatDate, isValidIsoDate } from '../lib/format';
import { driverMessage } from '../lib/planner';
import type { PlannerActions } from './Planner';
import { Confirm, Label, Modal } from './ui';

const MAX_STOPS = 40;
const emptyStop = (): TripStop => ({ id: crypto.randomUUID(), place: '', address: '', details: '' });

export function Trips({ items, store, run, notify }: PlannerActions & { items: Trip[]; store: DataStore }) {
  const [editor, setEditor] = useState<{ trip?: Trip } | null>(null);
  const [deleting, setDeleting] = useState<Trip | null>(null);
  const [sharing, setSharing] = useState<Trip | null>(null);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const messageField = useRef<HTMLTextAreaElement>(null);

  async function copyMessage(trip: Trip) {
    try {
      await navigator.clipboard.writeText(driverMessage(trip));
      notify('ok', 'Сообщение скопировано.');
    } catch {
      messageField.current?.focus();
      messageField.current?.select();
      notify('error', 'Выделили текст. Скопируйте его вручную.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">Рейсы</h2>
        <button className="btn btn-primary" onClick={() => setEditor({})}>Новый рейс</button>
      </div>
      {!items.length && (
        <p className="card p-4 text-sm text-slate-500">Добавьте магазины и терминалы в рейс, затем скопируйте список остановок для водителя.</p>
      )}
      {items.map((trip) => (
        <article key={trip.id} className="card space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold wrap-break-word">{trip.title}</h3>
              <p className="num mt-0.5 text-xs text-slate-500">{trip.date ? formatDate(trip.date) : 'Без даты'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn" onClick={() => setSharing(trip)}>Сообщение водителю</button>
              <button className="link" aria-label={`Изменить рейс: ${trip.title}`} disabled={deletingTrip} onClick={() => setEditor({ trip })}>Изменить</button>
              <button className="link text-bad" aria-label={`Удалить рейс: ${trip.title}`} disabled={deletingTrip} onClick={() => setDeleting(trip)}>Удалить</button>
            </div>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm marker:font-semibold marker:text-slate-500">
            {trip.stops.map((stop) => (
              <li key={stop.id} className="pl-1 wrap-break-word">
                <span className="font-semibold">{stop.place}</span>
                {stop.address && <p className="text-slate-600">{stop.address}</p>}
                {stop.details && <p className="whitespace-pre-wrap text-slate-600">{stop.details}</p>}
              </li>
            ))}
          </ol>
        </article>
      ))}
      {editor && <TripEditor trip={editor.trip} close={() => setEditor(null)} save={(input) => run(() => store.saveTrip(input, editor.trip), 'Рейс сохранён.')} />}
      {sharing && (
        <Modal title="Сообщение водителю" width="max-w-lg" onClose={() => setSharing(null)}
          footer={<button className="btn btn-primary" onClick={() => void copyMessage(sharing)}>Скопировать</button>}>
          <div className="p-4">
            <textarea className="field" aria-label="Текст для водителя" ref={messageField} rows={10} readOnly value={driverMessage(sharing)} autoFocus />
          </div>
        </Modal>
      )}
      {deleting && <Confirm title="Удалить рейс?" text={deleting.title} confirmLabel="Удалить" onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          setDeleting(null);
          setDeletingTrip(true);
          try {
            await run(() => store.deleteTrip(deleting));
          } finally {
            setDeletingTrip(false);
          }
        }} />}
    </div>
  );
}

function TripEditor({ trip, close, save }: { trip?: Trip; close: () => void; save: (input: TripInput) => Promise<boolean> }) {
  const [title, setTitle] = useState(trip?.title ?? '');
  const [date, setDate] = useState(trip?.date ?? '');
  const [stops, setStops] = useState(() => trip?.stops ?? [emptyStop()]);
  const [busy, setBusy] = useState(false);

  function updateStop(id: string, patch: Partial<Omit<TripStop, 'id'>>) {
    setStops((current) => current.map((stop) => stop.id === id ? { ...stop, ...patch } : stop));
  }

  function moveStop(index: number, offset: number) {
    setStops((current) => {
      const next = [...current];
      const target = index + offset;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const valid = title.trim() && (!date || isValidIsoDate(date)) && stops.every((stop) => stop.place.trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const saved = await save({
        title: title.trim(),
        date: date || null,
        stops: stops.map((stop) => ({ ...stop, place: stop.place.trim(), address: stop.address.trim(), details: stop.details.trim() })),
      });
      if (saved) close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={trip ? 'Изменить рейс' : 'Новый рейс'} onClose={() => { if (!busy) close(); }}
      footer={<button className="btn btn-primary" form="trip-form" disabled={busy || !valid}>{busy ? 'Сохраняем…' : 'Сохранить рейс'}</button>}>
      <form id="trip-form" onSubmit={submit} className="space-y-4 p-4">
        <fieldset disabled={busy} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <Label text="Название рейса">
              <input className="field" autoFocus required maxLength={120} placeholder="Например, Пятигорск и Минводы"
                value={title} onChange={(event) => setTitle(event.target.value)} />
            </Label>
            <Label text="Дата выезда">
              <input className="field" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Label>
          </div>
          <ol className="space-y-3">
            {stops.map((stop, index) => (
              <li key={stop.id} className="space-y-2 rounded-md border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">Остановка {index + 1}</h3>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn !px-2" aria-label={`Поднять остановку ${index + 1}`} disabled={index === 0} onClick={() => moveStop(index, -1)}>↑</button>
                    <button type="button" className="btn !px-2" aria-label={`Опустить остановку ${index + 1}`} disabled={index === stops.length - 1} onClick={() => moveStop(index, 1)}>↓</button>
                    <button type="button" className="btn !px-2" aria-label={`Убрать остановку ${index + 1}`} disabled={stops.length === 1}
                      onClick={() => setStops((current) => current.filter((item) => item.id !== stop.id))}>Убрать</button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Label text="Терминал, магазин или склад">
                    <input className="field" required maxLength={160} value={stop.place} onChange={(event) => updateStop(stop.id, { place: event.target.value })} />
                  </Label>
                  <Label text="Адрес">
                    <input className="field" maxLength={300} value={stop.address} onChange={(event) => updateStop(stop.id, { address: event.target.value })} />
                  </Label>
                </div>
                <Label text="Что забрать, номер накладной, часы работы">
                  <textarea className="field" rows={2} maxLength={600} value={stop.details} onChange={(event) => updateStop(stop.id, { details: event.target.value })} />
                </Label>
              </li>
            ))}
          </ol>
          <button className="btn" type="button" disabled={stops.length >= MAX_STOPS} onClick={() => setStops((current) => [...current, emptyStop()])}>Добавить остановку</button>
        </fieldset>
      </form>
    </Modal>
  );
}
