import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../auth/i18n.js';

// A free-trial login works on sample data for 3 days: say so on every page.
function TrialBanner() {
  const { account } = useAuth();
  const { t, lang } = useT();
  if (!account?.isDemoTrial) return null;
  const end = account.demoExpiresAt ? new Date(account.demoExpiresAt) : null;
  const when = end ? end.toLocaleString(lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return (
    <div data-testid="trial-banner" className="flex-shrink-0 bg-brandTint text-brand text-[12.5px] font-medium px-4 py-2 border-b border-line">
      {t('Free trial with sample data - it ends on {date}. Messages, AI and billing are off in the trial.', { date: when })}
    </div>
  );
}

export default function Layout({ title, count, actions, children }) {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full pt-14 md:pt-0">
        <TrialBanner />
        <Topbar title={title} count={count} actions={actions} />
        <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-7 md:py-6">{children}</main>
      </div>
    </div>
  );
}
