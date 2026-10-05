import { Link } from 'react-router-dom';
import { LEGAL_EFFECTIVE_DATE, TERMS_SECTIONS, PRIVACY_SECTIONS } from '../legalContent.js';
import { useT } from '../auth/i18n.js';
import { BRAND } from '../auth/brand.jsx';

function LegalDoc({ title, sections }) {
  const { t } = useT();
  return (
    <div className="min-h-[100dvh] bg-wash text-ink">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <Link to="/" className="text-sm text-muted hover:text-ink inline-block mb-6">&larr; {t('legalBack')}</Link>
        <h1 className={`${BRAND.titleFont} text-2xl font-semibold mb-1`}>{title}</h1>
        <p className="text-xs text-faint mb-8">{t('lastUpdated')}: {LEGAL_EFFECTIVE_DATE}</p>
        <div className="flex flex-col gap-6">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-[13px] font-semibold mb-1.5">{s.heading}</h2>
              <p className="text-[12.5px] leading-[1.7] text-muted whitespace-pre-line" style={{ overflowWrap: 'anywhere' }}>{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Terms() {
  const { t } = useT();
  return <LegalDoc title={t('termsTitle')} sections={TERMS_SECTIONS} />;
}

export function Privacy() {
  const { t } = useT();
  return <LegalDoc title={t('privacyTitle')} sections={PRIVACY_SECTIONS} />;
}
