import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { addMember, describeError, listMembers, removeMember, type Member } from '../lib/supabase';
import { Confirm } from './ui';

/** Список почт, которым открыт общий реестр. */
export function Members({ currentEmail, onNotify }: { currentEmail: string; onNotify: (kind: 'ok' | 'error', text: string) => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [toRemove, setToRemove] = useState<Member | null>(null);
  const me = currentEmail.toLowerCase();

  const reload = useCallback(async () => {
    try {
      setMembers(await listMembers());
    } catch (e) {
      onNotify('error', describeError(e));
    }
  }, [onNotify]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return onNotify('error', 'Проверьте адрес электронной почты.');
    if (members?.some((m) => m.email === address)) return onNotify('error', 'Эта почта уже в списке.');
    setBusy(true);
    try {
      await addMember(address);
      setEmail('');
      onNotify('ok', `${address} добавлен. Теперь этот человек может войти со своей почтой.`);
      await reload();
    } catch (err) {
      onNotify('error', describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: Member) => {
    setToRemove(null);
    try {
      await removeMember(m.email);
      onNotify('ok', `${m.email} больше не имеет доступа.`);
      await reload();
    } catch (err) {
      onNotify('error', describeError(err));
    }
  };

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-bold">Участники</h2>
        <p className="text-xs text-slate-500">Все участники видят и редактируют один общий реестр расходов</p>
      </header>

      {members === null ? (
        <div className="flex flex-col gap-3 p-4" aria-busy="true">
          <div className="skeleton h-6 w-full" />
          <div className="skeleton h-6 w-full" />
        </div>
      ) : (
        <ul>
          {members.map((m) => (
            <li key={m.email} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{m.email}</span>
                {m.email === me && <span className="text-slate-400"> · это вы</span>}
              </span>
              {m.email !== me && (
                <button className="link link-danger shrink-0" onClick={() => setToRemove(m)}>
                  Закрыть доступ
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap items-end gap-2 px-4 py-4" noValidate>
        <label className="min-w-0 flex-1 basis-64">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Почта нового участника</span>
          <input type="email" className="field" placeholder="name@company.ru" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={busy || !email.trim()}>
          {busy ? 'Добавляем…' : 'Открыть доступ'}
        </button>
      </form>

      {toRemove && (
        <Confirm
          title="Закрыть доступ?"
          text={`${toRemove.email} больше не сможет открывать реестр. Расходы, которые этот человек добавил, останутся.`}
          confirmLabel="Закрыть доступ"
          onCancel={() => setToRemove(null)}
          onConfirm={() => void remove(toRemove)}
        />
      )}
    </section>
  );
}
