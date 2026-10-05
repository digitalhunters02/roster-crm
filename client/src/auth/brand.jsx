// Per-product bits the shared sign-in screens need.
export const BRAND = {
  name: 'Roster',
  tagline: 'Crestline Talent Partners',
  storageKey: 'roster-crm-session',
  langKey: 'roster-lang',
  titleFont: 'font-display',
};

export function BrandLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#5B4EE0" />
      <circle cx="13" cy="13" r="4.2" fill="#F7F5FF" />
      <path d="M7 24c0-4.4 3.4-7.8 7.6-7.8" stroke="#F7F5FF" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M25 24c0-3.6-2.2-6.6-5.4-7.5" stroke="#FF6B57" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
