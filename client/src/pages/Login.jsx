import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { authApi } from '../auth/authApi.js';
import { useT, friendlyError } from '../auth/i18n.js';
import AuthShell, { ErrorNote, PrimaryButton } from '../auth/AuthShell.jsx';
import PasswordField, { TextField } from '../auth/PasswordField.jsx';

// "Try it free for 3 days": name + email, no password, no card. Opens a temporary login on the sample data.
function TrialForm({ onBack }) {
  const { startTrial } = useAuth();
  const { t } = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await startTrial(name.trim(), email.trim());
    } catch (err) {
      setError(friendlyError(err, t));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="trial-form">
      <p className="text-[13px] text-muted mb-4">{t('Try Roster free for 3 days with sample data - no credit card required.')}</p>
      <TextField label={t('Your name')} name="name" autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <TextField label={t('email')} type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <ErrorNote>{error}</ErrorNote>
      <PrimaryButton type="submit" disabled={busy}>{busy ? t('Starting…') : t('Start my trial')}</PrimaryButton>
      <button type="button" onClick={onBack} className="w-full text-center text-[12px] font-medium text-muted hover:text-ink mt-3 py-1">
        {t('Cancel')}
      </button>
    </form>
  );
}

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
    <AuthShell subtitle={mode === 'forgot' ? t('forgotTitle') : mode === 'trial' ? t('Free trial') : undefined}>
      {mode === 'forgot' ? (
        <ForgotPasswordForm onBack={() => { setMode('login'); setError(''); }} />
      ) : mode === 'trial' ? (
        <TrialForm onBack={() => { setMode('login'); setError(''); }} />
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
          <div className="border-t border-line mt-5 pt-4 text-center">
            <p className="text-[12.5px] text-muted mb-2">{t('Just exploring?')}</p>
            <button type="button" data-testid="open-trial" onClick={() => { setMode('trial'); setError(''); }} className="text-[13px] font-semibold text-brand">
              {t('Try it free for 3 days')}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
