import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Avatar } from './ui.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../auth/i18n.js';
import { useBilling } from '../billing/useBilling.js';
import { useProfile } from '../profile/useProfile.js';
import Tour from '../tour/Tour.jsx';
import { LogOutIcon } from '../auth/AuthIcons.jsx';

const TOUR_KEY = 'roster-tour-done';
// Menu entries that need a higher plan show a lock (the page itself explains the upgrade).
const LOCKED_BY = { '/timesheets': 'timesheets', '/whatsapp': 'whatsapp' };

const NAV = [
  { section: null, items: [{ to: '/', label: 'Dashboard', icon: 'dashboard' }] },
  {
    section: 'Recruiting',
    items: [
      { to: '/candidates', label: 'Candidates', icon: 'candidate' },
      { to: '/jobs', label: 'Jobs', icon: 'briefcase' },
      { to: '/pipeline', label: 'Pipeline', icon: 'funnel' },
      { to: '/interviews', label: 'Interviews', icon: 'calendarCheck' },
    ],
  },
  {
    section: 'Clients',
    items: [{ to: '/clients', label: 'Clients', icon: 'building' }],
  },
  {
    section: 'Placements',
    items: [
      { to: '/placements', label: 'Placements', icon: 'badge' },
      { to: '/timesheets', label: 'Timesheets & Invoicing', icon: 'receipt' },
    ],
  },
  {
    section: 'Messaging',
    items: [{ to: '/whatsapp', label: 'WhatsApp', icon: 'phoneCall' }],
  },
  {
    section: 'System',
    items: [
      { to: '/automations', label: 'Automations', icon: 'zap' },
      { to: '/reports', label: 'Reports', icon: 'barChart' },
      { to: '/settings', label: 'Settings', icon: 'sliders' },
    ],
  },
];

function BrandMark({ logo, size = 32 }) {
  const { t } = useT();
  return logo ? (
    <img src={logo} alt={t('Crestline Talent Partners')} width={size} height={size} className="rounded-lg object-cover flex-shrink-0" style={{ width: size, height: size }} />
  ) : (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="flex-shrink-0">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#5B4EE0" />
      <circle cx="13" cy="13" r="4.2" fill="#F7F5FF" />
      <path d="M7 24c0-4.4 3.4-7.8 7.6-7.8" stroke="#F7F5FF" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M25 24c0-3.6-2.2-6.6-5.4-7.5" stroke="#FF6B57" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function Sidebar() {
  const { account, logout } = useAuth();
  const { t } = useT();
  const profile = useProfile();
  const logo = profile.logo || null;
  const { billing } = useBilling();
  const [open, setOpen] = useState(false);
  const [tour, setTour] = useState(false);

  // The getting-started guide opens by itself the first time each login arrives, and never again on its own.
  useEffect(() => {
    if (!account) return;
    const key = `${TOUR_KEY}-${account.id}`;
    try {
      if (localStorage.getItem(key) === '1') return;
      localStorage.setItem(key, '1');
    } catch { /* storage blocked: the guide still opens once per page load */ }
    setTour(true);
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeTour() { setTour(false); setOpen(false); }

  function closeDrawer() {
    setOpen(false);
  }

  return (
    <>
      {/* Mobile top bar — hamburger + brand, fixed above the page, hidden at md: and up */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center gap-3 px-4 bg-side text-white shadow-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('Open menu')}
          className="p-1.5 -ml-1.5 rounded-md text-white hover:bg-side2 transition-colors"
        >
          <Icon name="menu" size={22} stroke="currentColor" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <BrandMark logo={logo} size={24} />
          <p className="font-display font-bold text-[15px] text-white leading-tight truncate">Roster</p>
        </div>
      </header>

      {/* Backdrop — only present while the drawer is open, mobile only */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] max-w-[82vw] shadow-2xl transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 md:shadow-none md:transition-none md:flex-shrink-0 bg-side text-sideText flex flex-col h-full min-h-0`}
      >
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-5 flex-shrink-0">
          <BrandMark logo={logo} size={32} />
          <div className="min-w-0">
            <p className="font-display font-bold text-[17px] text-white leading-tight">Roster</p>
            <p className="text-[11px] text-sideMuted leading-tight truncate">{profile.name || t('Staffing CRM')}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto min-h-0 px-3 pb-4">
          {NAV.map((group, gi) => (
            <div key={gi} className="mb-4">
              {group.section && (
                <p className="px-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-sideMuted">
                  {t(group.section)}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    data-tour={`nav-${item.to === '/' ? 'dashboard' : item.to.slice(1)}`}
                    end={item.to === '/'}
                    onClick={closeDrawer}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13.5px] font-semibold transition-colors ${
                        isActive ? 'bg-side2 text-white' : 'text-sideText hover:bg-side2/60 hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-coral" />
                        )}
                        <Icon name={item.icon} size={16} stroke={isActive ? '#B9AFF7' : '#8A82B8'} />
                        <span className="flex-1 min-w-0 truncate">{t(item.label)}</span>
                        {LOCKED_BY[item.to] && billing && billing.features && billing.features[LOCKED_BY[item.to]] === false && (
                          <span title={t('Not in your plan')} data-testid={`lock-${item.to.slice(1)}`}><Icon name="lock" size={13} stroke="#8A82B8" /></span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <div className="mb-2">
            <button
              type="button"
              data-tour="nav-tour"
              data-testid="open-tour"
              onClick={() => setTour(true)}
              className="w-full relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13.5px] font-semibold text-sideText hover:bg-side2/60 hover:text-white transition-colors"
            >
              <Icon name="compass" size={16} stroke="#8A82B8" />
              {t('Getting started')}
            </button>
          </div>
        </nav>

        <div className="px-4 py-3.5 border-t border-sideLine flex items-center gap-2.5 flex-shrink-0">
          <NavLink to="/settings" onClick={closeDrawer} title={t('accountTitle')} className="flex items-center gap-2.5 min-w-0 flex-grow">
            <Avatar name={account?.name || 'Roster'} color="#5B4EE0" size={30} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white truncate">{account?.name}</p>
              <p className="text-[11px] text-sideMuted truncate">{account?.role === 'owner' ? t('owner') : t('staff')}</p>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={logout}
            title={t('signOut')}
            aria-label={t('signOut')}
            data-testid="signout"
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-sideText hover:bg-side2 hover:text-white transition-colors"
          >
            <LogOutIcon />
          </button>
        </div>
      </aside>
      <Tour open={tour} onClose={closeTour} ensureNav={() => setOpen(true)} />
    </>
  );
}
