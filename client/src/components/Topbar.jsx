import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import api from '../api.js';

import { useT } from '../auth/i18n.js';
const READ_KEY = 'roster-alerts-seen';

// The bell lists the latest alerts written by the automations (Activity log, type "Automation").
export default function Topbar({ title, count, actions }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(READ_KEY) || ''; } catch { return ''; } });
  const panelRef = useRef(null);

  useEffect(() => {
    api.activities().then((rows) => setAlerts((rows || []).filter((a) => a.type === 'Automation').slice(0, 8))).catch(() => {});
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const newest = alerts.reduce((m, a) => (String(a.occurred_at) > m ? String(a.occurred_at) : m), '');
  const unread = !!newest && newest > seen;

  function toggleBell() {
    setOpen((o) => !o);
    if (unread) {
      setSeen(newest);
      try { localStorage.setItem(READ_KEY, newest); } catch { /* ignore */ }
    }
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-7 md:py-4 border-b border-line bg-surface flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <h1 className="font-display text-[17px] md:text-[19px] font-semibold text-ink">{title}</h1>
        {typeof count === 'number' && (
          <span className="text-xs font-semibold text-muted bg-wash px-2 py-0.5 rounded-full">{count}</span>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end ml-auto">
        {actions}
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={toggleBell}
            title={t('Notifications')}
            className="relative text-muted hover:text-ink transition-colors"
          >
            <Icon name="bell" size={19} />
            {unread && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-coral" />}
          </button>
          {open && (
            <div className="absolute right-0 top-8 z-40 w-72 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-lg shadow-lg py-3 px-4" data-testid="alerts-panel">
              <p className="text-xs font-semibold text-ink mb-1">{t('Notifications')}</p>
              {alerts.length === 0 && <p className="text-xs text-muted">{t('You\'re all caught up.')}</p>}
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {alerts.map((a) => <li key={a.id} className="text-xs text-ink border-t border-lineSoft pt-2 first:border-0 first:pt-0">{a.subject}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
