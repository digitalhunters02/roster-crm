import { BRAND, BrandLogo } from './brand.jsx';
import { useT, LANGS } from './i18n.js';

// Centered card used by Login / Reset / forced password change.
export default function AuthShell({ subtitle, children, showLegal = true }) {
  const { t, lang, setLang } = useT();
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-wash px-4 py-8">
      <div className="w-full max-w-sm bg-surface border border-line rounded-2xl shadow-sm p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <BrandLogo size={44} />
          <div className={`${BRAND.titleFont} text-2xl font-semibold text-ink mt-3`}>{BRAND.name}</div>
          <div className="text-xs text-muted mt-1">{subtitle || BRAND.tagline}</div>
        </div>
        {children}
        {showLegal && (
          <p className="text-center text-[11px] text-faint mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <a href="#/terms" className="hover:text-muted">{t('terms')}</a>
            <span aria-hidden="true">&middot;</span>
            <a href="#/privacy" className="hover:text-muted">{t('privacy')}</a>
          </p>
        )}
      </div>
      <label className="mt-4 flex items-center gap-2 text-xs text-muted">
        <span>{t('language')}</span>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          aria-label={t('language')}
          className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
        >
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <div role="alert" className="text-sm text-rose bg-roseTint border border-rose/30 rounded-md px-3 py-2 mb-3.5">{children}</div>;
}

export function PrimaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="w-full inline-flex items-center justify-center rounded-lg bg-brand text-white font-semibold text-sm px-3.5 py-2.5 hover:bg-brand/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}
