import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../auth/authApi.js';
import { useT, friendlyError } from '../auth/i18n.js';
import AuthShell, { ErrorNote, PrimaryButton } from '../auth/AuthShell.jsx';
import PasswordField from '../auth/PasswordField.jsx';

export default function ResetPassword() {
  const { t } = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError(t('pwMin'));
    if (password !== confirm) return setError(t('pwMismatch'));
    setBusy(true);
    try {
      await authApi.reset(token, password);
      setDone(true);
    } catch (err) {
      setError(friendlyError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell subtitle={t('resetTitle')}>
      {done ? (
        <div>
          <p className="text-[13px] text-muted mb-4" data-testid="reset-done">{t('resetDone')}</p>
          <PrimaryButton type="button" onClick={() => navigate('/', { replace: true })}>{t('backToSignIn')}</PrimaryButton>
        </div>
      ) : !token ? (
        <div>
          <ErrorNote>{t('resetNoToken')}</ErrorNote>
          <PrimaryButton type="button" onClick={() => navigate('/', { replace: true })}>{t('backToSignIn')}</PrimaryButton>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <PasswordField label={t('newPassword')} name="new-password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          <PasswordField label={t('confirmPassword')} name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <ErrorNote>{error}</ErrorNote>
          <PrimaryButton type="submit" disabled={busy}>{busy ? t('saving') : t('setPassword')}</PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
