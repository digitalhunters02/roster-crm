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
    section: 'System',
    items: [
      { to: '/automations', label: 'Automations', icon: 'zap' },
      { to: '/reports', label: 'Reports', icon: 'barChart' },
      { to: '/settings', label: 'Settings', icon: 'sliders' },
    ],
  },
];

export default function Sidebar() {
  const [logo, setLogo] = useState(null);

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

  return (
    <aside className="w-64 flex-shrink-0 bg-side text-sideText flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5 flex-shrink-0">
        {logo ? (
          <img src={logo} alt="Crestline Talent Partners" width={32} height={32} className="rounded-lg object-cover w-8 h-8" />
        ) : (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#5B4EE0" />
            <circle cx="13" cy="13" r="4.2" fill="#F7F5FF" />
            <path d="M7 24c0-4.4 3.4-7.8 7.6-7.8" stroke="#F7F5FF" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M25 24c0-3.6-2.2-6.6-5.4-7.5" stroke="#FF6B57" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        )}
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
  );
}
