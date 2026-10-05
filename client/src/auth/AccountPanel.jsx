import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { authApi } from './authApi.js';
import { useT, friendlyError } from './i18n.js';
import { BRAND } from './brand.jsx';
import PasswordField, { TextField, inputCls } from './PasswordField.jsx';
import { ErrorNote, PrimaryButton } from './AuthShell.jsx';
import { LogOutIcon } from './AuthIcons.jsx';

function Panel({ title, sub, action, children }) {
  return (
    <div className="bg-surface border border-line rounded-xl min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className={`${BRAND.titleFont} text-[15px] font-semibold text-ink`}>{title}</h3>
          {sub && <p className="text-xs text-muted mt-0.5" style={{ overflowWrap: 'anywhere' }}>{sub}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

function Notice({ children }) {
  if (!children) return null;
  return <div role="status" className="text-sm text-green bg-greenTint border border-green/30 rounded-md px-3 py-2 mb-3.5">{children}</div>;
}

// The change-password form, also used full-screen when an owner-issued
// temporary password has to be replaced before using the app.
export function ChangePasswordForm({ onDone }) {
  const { t } = useT();
  const { replaceSession } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setOk(false);
    if (next.length < 8) return setError(t('pwMin'));
    if (next !== confirm) return setError(t('pwMismatch'));
    setBusy(true);
    try {
      const res = await authApi.changePassword(current, next);
      replaceSession({ token: res.token, account: res.account });
      setCurrent(''); setNext(''); setConfirm('');
      setOk(true);
      if (onDone) onDone();
    } catch (err) {
      setError(friendlyError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <PasswordField label={t('currentPassword')} name="current-password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <PasswordField label={t('newPassword')} name="new-password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      <PasswordField label={t('confirmPassword')} name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <ErrorNote>{error}</ErrorNote>
      <Notice>{ok ? t('passwordChanged') : ''}</Notice>
      <PrimaryButton type="submit" disabled={busy}>{busy ? t('saving') : t('changePassword')}</PrimaryButton>
    </form>
  );
}

export function MyAccountCard() {
  const { t } = useT();
  const { account, logout } = useAuth();
  return (
    <Panel
      title={t('accountTitle')}
      sub={account ? `${account.name} · ${account.email}` : ''}
      action={
        <button
          type="button"
          onClick={logout}
          data-testid="signout-settings"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-wash"
        >
          <LogOutIcon width={14} height={14} /> {t('signOut')}
        </button>
      }
    >
      <h4 className="text-xs font-semibold text-muted mb-3 uppercase tracking-wide">{t('changePassword')}</h4>
      <ChangePasswordForm />
    </Panel>
  );
}

// Owner only: add / remove the people who can sign in.
export function StaffCard() {
  const { t, lang } = useT();
  const { account } = useAuth();
  const [list, setList] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [tempFor, setTempFor] = useState(null);
  const [tempPw, setTempPw] = useState('');

  const load = () => authApi.accounts().then(setList).catch((e) => setError(friendlyError(e, t)));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function create(e) {
    e.preventDefault();
    setError(''); setNotice('');
    if (form.password.length < 8) return setError(t('pwMin'));
    setBusy(true);
    try {
      await authApi.createAccount(form);
      setForm({ name: '', email: '', password: '' });
      setAdding(false);
      setNotice(t('accountCreated'));
      load();
    } catch (err) {
      setError(friendlyError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function remove(a) {
    if (!window.confirm(t('removeConfirm', { name: a.name }))) return;
    setError(''); setNotice('');
    try {
      await authApi.deleteAccount(a.id);
      load();
    } catch (err) {
      setError(friendlyError(err, t));
    }
  }

  async function setTemp(e) {
    e.preventDefault();
    setError(''); setNotice('');
    if (tempPw.length < 8) return setError(t('pwMin'));
    try {
      await authApi.setAccountPassword(tempFor.id, tempPw);
      setTempFor(null); setTempPw('');
      setNotice(t('tempSet'));
    } catch (err) {
      setError(friendlyError(err, t));
    }
  }

  return (
    <Panel
      title={t('staffTitle')}
      sub={t('staffSub', { app: BRAND.name })}
      action={
        !adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setError(''); setNotice(''); }}
            data-testid="add-staff"
            className="rounded-lg bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:bg-brand/90"
          >
            {t('addStaff')}
          </button>
        )
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <Notice>{notice}</Notice>
      {adding && (
        <form onSubmit={create} className="border border-line rounded-lg p-3.5 mb-4 bg-wash/50">
          <TextField label={t('name')} name="staff-name" autoComplete="off" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <TextField label={t('email')} type="email" name="staff-email" autoComplete="off" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <PasswordField label={t('tempPassword')} name="staff-password" autoComplete="new-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <p className="text-xs text-faint -mt-2 mb-3.5">{t('tempPasswordHint')}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="flex-1 rounded-lg border border-line px-3 py-2.5 text-sm font-semibold text-ink hover:bg-wash">{t('cancel')}</button>
            <div className="flex-1"><PrimaryButton type="submit" disabled={busy}>{busy ? t('creating') : t('createAccount')}</PrimaryButton></div>
          </div>
        </form>
      )}
      {!list && <p className="text-sm text-muted">{t('loading')}</p>}
      <ul className="divide-y divide-line">
        {(list || []).map((a) => (
          <li key={a.id} className="py-3 first:pt-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink truncate">
                  {a.name}{a.id === account?.id && <span className="text-faint font-normal"> ({t('you')})</span>}
                </p>
                <p className="text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>{a.email}</p>
              </div>
              <span className="text-[11px] font-semibold rounded-full bg-brandTint text-brand px-2 py-0.5">{a.role === 'owner' ? t('owner') : t('staff')}</span>
              {a.role !== 'owner' && (
                <>
                  <button type="button" onClick={() => { setTempFor(a); setTempPw(''); }} className="text-xs font-semibold text-muted hover:text-ink">{t('setTemp')}</button>
                  <button type="button" onClick={() => remove(a)} className="text-xs font-semibold text-rose">{t('remove')}</button>
                </>
              )}
            </div>
            {tempFor?.id === a.id && (
              <form onSubmit={setTemp} className="mt-3">
                <label className="block text-xs font-semibold text-muted mb-1.5">{t('tempPassword')}</label>
                <div className="flex gap-2 flex-wrap">
                  <input value={tempPw} onChange={(e) => setTempPw(e.target.value)} autoComplete="off" className={`${inputCls} flex-1 min-w-0`} />
                  <button type="submit" className="rounded-lg bg-brand text-white px-3 py-2 text-sm font-semibold">{t('setTemp')}</button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
