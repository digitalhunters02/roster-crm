import PlanBadge, { usePlanGate } from '../planKit/PlanBadge.jsx';
import { gateText, planStr } from '../planKit/planStrings.js';
import { useT } from '../auth/i18n.js';

// Body of a settings card whose feature is in a higher plan: what it does + the plan SEAL + a button that opens the
// "Available on the X plan" window. Used in place of the card content (the card itself stays on the screen).
export function LockedNote({ gate }) {
  const { lang } = useT();
  const g = usePlanGate(gate);
  const text = gateText(gate, lang);
  return (
    <div className="px-5 pb-5 flex flex-wrap items-center gap-3" data-plan-notice={gate} data-testid="complete-locked">
      <p className="flex-1 min-w-[200px] text-sm text-muted m-0">{text ? text.what : ''}<PlanBadge gate={gate} /></p>
      <button type="button" onClick={g.open} data-testid={`${gate}-locked-open`} className="inline-flex items-center min-h-[40px] px-3 rounded-lg border border-line bg-surface text-sm font-semibold text-ink hover:bg-wash">{planStr(lang).details}</button>
    </div>
  );
}
