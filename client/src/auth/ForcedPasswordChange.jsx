import { useT } from './i18n.js';
import { useAuth } from './AuthContext.jsx';
import AuthShell from './AuthShell.jsx';
import { ChangePasswordForm } from './AccountPanel.jsx';

// Shown instead of the app when the owner issued a temporary password.
export default function ForcedPasswordChange() {
  const { t } = useT();
  const { logout } = useAuth();
  return (
    <AuthShell subtitle={t('mustChange')} showLegal={false}>
      <ChangePasswordForm />
      <button type="button" onClick={logout} className="w-full text-center text-[12px] font-medium text-muted hover:text-ink mt-3 py-1">
        {t('signOut')}
      </button>
    </AuthShell>
  );
}
