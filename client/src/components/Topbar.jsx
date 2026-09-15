import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const READ_KEY = 'roster-notifications-read';

export default function Topbar({ title, count, actions }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(true);
  const panelRef = useRef(null);

  useEffect(() => {
    try {
      setUnread(localStorage.getItem(READ_KEY) !== '1');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function toggleBell() {
    setOpen((o) => !o);
    if (unread) {
      setUnread(false);
      try {
        localStorage.setItem(READ_KEY, '1');
      } catch {
        // ignore
      }
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
        <div className="hidden md:flex items-center gap-2 bg-wash rounded-lg px-3 py-1.5 w-64">
          <Icon name="search" size={15} stroke="#9498B3" />
          <input
            placeholder="Search Roster…"
            className="bg-transparent text-sm outline-none placeholder:text-faint w-full"
            readOnly
          />
        </div>
        {actions}
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={toggleBell}
            title="Notifications"
            className="relative text-muted hover:text-ink transition-colors"
          >
            <Icon name="bell" size={19} />
            {unread && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-coral" />}
          </button>
          {open && (
            <div className="absolute right-0 top-8 z-40 w-64 bg-surface border border-line rounded-lg shadow-lg py-3 px-4">
              <p className="text-xs font-semibold text-ink mb-1">Notifications</p>
              <p className="text-xs text-muted">You're all caught up.</p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
