import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Avatar } from './ui.jsx';

const LOGO_KEY = 'roster-company-logo';

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
  return logo ? (
    <img src={logo} alt="Crestline Talent Partners" width={size} height={size} className="rounded-lg object-cover flex-shrink-0" style={{ width: size, height: size }} />
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
  const [logo, setLogo] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOGO_KEY);
      if (saved) setLogo(saved);
    } catch {
      // ignore — localStorage unavailable
    }
    function onStorage() {
      try {
        setLogo(localStorage.getItem(LOGO_KEY));
      } catch {
        // ignore
      }
    }
    window.addEventListener('roster-logo-updated', onStorage);
    return () => window.removeEventListener('roster-logo-updated', onStorage);
  }, []);

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
          aria-label="Open menu"
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
          <div>
            <p className="font-display font-bold text-[17px] text-white leading-tight">Roster</p>
            <p className="text-[11px] text-sideMuted leading-tight">Crestline Talent Partners</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto min-h-0 px-3 pb-4">
          {NAV.map((group, gi) => (
            <div key={gi} className="mb-4">
              {group.section && (
                <p className="px-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-sideMuted">
                  {group.section}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
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
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-sideLine flex items-center gap-2.5 flex-shrink-0">
          <Avatar name="Maya Solano" color="#5B4EE0" size={30} />
          <div className="min-w-0 flex-grow">
            <p className="text-[13px] font-semibold text-white truncate">Maya Solano</p>
            <p className="text-[11px] text-sideMuted truncate">Managing Partner</p>
          </div>
        </div>
      </aside>
    </>
  );
}
