import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Candidates from './pages/Candidates.jsx';
import Jobs from './pages/Jobs.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Interviews from './pages/Interviews.jsx';
import Clients from './pages/Clients.jsx';
import Placements from './pages/Placements.jsx';
import Timesheets from './pages/Timesheets.jsx';
import Automations from './pages/Automations.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import WhatsApp from './pages/WhatsApp.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import { Terms, Privacy } from './pages/Legal.jsx';
import { useAuth } from './auth/AuthContext.jsx';
import ForcedPasswordChange from './auth/ForcedPasswordChange.jsx';
import { useT } from './auth/i18n.js';

export default function App() {
  const { token, account, checking } = useAuth();
  const { t } = useT();

  if (checking) {
    return <div className="min-h-[100dvh] flex items-center justify-center text-sm text-muted">{t('loading')}</div>;
  }

  // Signed out: only the sign-in flow and the legal pages are reachable.
  if (!token) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Owner issued a temporary password: it must be replaced before anything else.
  if (account?.mustChangePassword) return <ForcedPasswordChange />;

  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/" element={<Dashboard />} />
      <Route path="/candidates" element={<Candidates />} />
      <Route path="/jobs" element={<Jobs />} />
      <Route path="/pipeline" element={<Pipeline />} />
      <Route path="/interviews" element={<Interviews />} />
      <Route path="/clients" element={<Clients />} />
      <Route path="/placements" element={<Placements />} />
      <Route path="/timesheets" element={<Timesheets />} />
      <Route path="/automations" element={<Automations />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/whatsapp" element={<WhatsApp />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
