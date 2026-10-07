import { Link } from 'react-router-dom';
import { Card, Badge } from '../components/ui.jsx';
import { usePlan } from './PlanContext.jsx';

export function LockIcon({ size = 13, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// Envolve uma página: se o plano não libera o recurso, mostra o convite em vez da página.
export default function PlanGate({ feature, title, children }) {
  const { billing, allows } = usePlan();
  if (allows(feature)) return children;
  const need = billing?.featureMinPlan?.[feature];
  const label = billing?.plans?.find((p) => p.id === need)?.label || 'a higher';
  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <Card className="p-8 text-center">
        <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-brandTint text-brand flex items-center justify-center"><LockIcon size={20} /></div>
        <h2 className="font-display text-lg font-semibold text-ink">{title || 'This feature'} is not in your plan</h2>
        <p className="text-sm text-muted mt-1.5">It is available on the <Badge tone="brand">{label}</Badge> plan{label === 'a higher' ? '' : ' and above'}.</p>
        <Link to="/settings" className="inline-block mt-5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90">See plans</Link>
      </Card>
    </div>
  );
}
