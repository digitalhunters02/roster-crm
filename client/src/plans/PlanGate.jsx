import { Card } from '../components/ui.jsx';
import { usePlan } from './PlanContext.jsx';
import { usePlanGate } from '../planKit/PlanBadge.jsx';
import PlanBadge from '../planKit/PlanBadge.jsx';
import { gateText, planStr } from '../planKit/planStrings.js';
import { useT } from '../auth/i18n.js';

export function LockIcon({ size = 13, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// Envolve uma página: se o plano não libera o recurso (quem entrou pelo endereço), mostra o aviso com o SELO do plano e o botão que abre
// a janelinha "Disponível no plano X" (o menu já abre a janelinha direto, sem trocar de página).
export default function PlanGate({ feature, title, children }) {
  const { allows } = usePlan();
  const { lang } = useT();
  const g = usePlanGate(feature);
  if (allows(feature)) return children;
  const text = gateText(feature, lang);
  return (
    <div className="max-w-xl mx-auto px-4 py-16" data-plan-notice={feature}>
      <Card className="p-8 text-center">
        <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-brandTint text-brand flex items-center justify-center"><LockIcon size={20} /></div>
        <h2 className="font-display text-lg font-semibold text-ink">{text ? text.name : title}<PlanBadge gate={feature} /></h2>
        {text && <p className="text-sm text-muted mt-1.5">{text.what}</p>}
        <button type="button" onClick={g.open} data-testid="plan-notice-open" className="inline-flex items-center justify-center min-h-[40px] mt-5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90">{planStr(lang).details}</button>
      </Card>
    </div>
  );
}
