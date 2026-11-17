import { useState, type FormEvent } from 'react';
import { describeError, googleEnabled, signInWithEmail, signInWithGoogle } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');

  const attempt = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError('Проверьте адрес электронной почты.');
    void attempt(async () => {
      await signInWithEmail(address);
      setSentTo(address);
    });
  };

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="text-lg font-bold">ФинУчет ИИ</div>
        <h1 className="mt-6 text-2xl leading-tight font-bold">Учёт бизнес-расходов без ручного ввода</h1>
        <p className="mt-3 text-sm text-slate-500">
          Загрузите счёт, чек или заметку — ИИ заполнит карточку расхода, вы проверите и получите Excel-отчёт.
        </p>

        {sentTo ? (
          <div className="mt-8" role="status">
            <p className="text-sm font-semibold text-ok">Письмо отправлено</p>
            <p className="mt-1 text-sm text-slate-600">
              Откройте ссылку из письма на <span className="font-semibold">{sentTo}</span> в этом браузере — вход выполнится автоматически.
            </p>
            <button className="link mt-3" onClick={() => setSentTo('')}>
              Указать другой адрес
            </button>
          </div>
        ) : (
          <>
            {googleEnabled && (
              <>
                <button className="btn btn-primary mt-8 h-11 w-full" onClick={() => attempt(signInWithGoogle)} disabled={busy}>
                  Войти через Google
                </button>
                <div className="mt-5 text-center text-xs text-slate-400">или по ссылке из письма</div>
              </>
            )}
            <form onSubmit={submitEmail} className={googleEnabled ? 'mt-3' : 'mt-8'} noValidate>
              <label htmlFor="login-email" className="mb-1 block text-xs font-semibold text-slate-500">
                Электронная почта
              </label>
              <input
                id="login-email"
                type="email"
                className="field !h-11"
                placeholder="name@company.ru"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" className={`btn mt-3 h-11 w-full ${googleEnabled ? '' : 'btn-primary'}`} disabled={busy}>
                {busy ? 'Отправляем…' : 'Получить ссылку для входа'}
              </button>
            </form>
          </>
        )}

        {error && (
          <p className="mt-3 text-[13px] text-bad" role="alert">
            {error}
          </p>
        )}
        <p className="mt-6 text-xs text-slate-400">Данные хранятся в облаке и доступны только вашему аккаунту.</p>
      </div>
    </main>
  );
}
