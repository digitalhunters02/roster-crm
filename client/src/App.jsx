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

export default function App() {
  return (
    <Routes>
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
