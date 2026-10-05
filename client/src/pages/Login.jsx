import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { authApi } from '../auth/authApi.js';
import { useT, friendlyError } from '../auth/i18n.js';
import AuthShell, { ErrorNote, PrimaryButton } from '../auth/AuthShell.jsx';
import PasswordField, { TextField } from '../auth/PasswordField.jsx';

function ForgotPasswordForm({ onBack }) {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setResult(await authApi.forgot(email));
    } catch (err) {
      setError(friendlyError(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div>
        <p className="text-[13px] text-muted mb-3" data-testid="forgot-sent">{t('sentGeneric')}</p>
        {result.emailConfigured === false && (
          <p className="text-[12.5px] text-muted bg-wash border border-line rounded-md px-3 py-2 mb-4" data-testid="forgot-no-mailer">{t('noMailer')}</p>
        )}
        <PrimaryButton type="button" onClick={onBack}>{t('backToSignIn')}</PrimaryButton>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="text-[13px] text-muted mb-4">{t('forgotIntro')}</p>
      <TextField label={t('email')} type="email" name="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      <ErrorNote>{error}</ErrorNote>
      <PrimaryButton type="submit" disabled={busy}>{busy ? t('sending') : t('sendLink')}</PrimaryButton>
      <button type="button" onClick={onBack} className="w-full text-center text-[12px] font-medium text-muted hover:text-ink mt-3 py-1">
        {t('backToSignIn')}
      </button>
    </form>
  );
}

export default function Login() {
  const { login } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('login');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password, remember);
    } catch (err) {
      setError(friendlyError(err, t));
      setBusy(false);
    }
  }

  return (
    <AuthShell subtitle={mode === 'forgot' ? t('forgotTitle') : undefined}>
      {mode === 'forgot' ? (
        <ForgotPasswordForm onBack={() => { setMode('login'); setError(''); }} />
      ) : (
        <form onSubmit={handleSubmit}>
          <TextField label={t('email')} type="email" name="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordField label={t('password')} name="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3.5 -mt-1">
            <label className="flex items-center gap-2 text-[12px] font-medium text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-line accent-brand"
              />
              {t('remember')}
            </label>
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(''); }}
              className="text-[12px] font-semibold text-brand"
            >
              {t('forgot')}
            </button>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <PrimaryButton type="submit" disabled={busy}>{busy ? t('signingIn') : t('signIn')}</PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
