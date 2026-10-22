import { Button } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import PlanBadge, { usePlanGate } from '../planKit/PlanBadge.jsx';
import { usePlan } from './PlanContext.jsx';

// Buttons that belong to a feature of a higher plan. They stay on the screen: with the plan, they work as always; without it,
// they carry the SEAL of the plan that unlocks them and a tap opens the "Available on the X plan" window instead.

// Page-level button: the seal sits inside the button.
export function GateButton({ gate, onClick, children, ...rest }) {
  const g = usePlanGate(gate);
  return (
    <Button {...rest} data-gate={gate} data-plan-locked={g.locked ? g.minPlan : undefined} onClick={g.locked ? g.open : onClick}>
      {children}{g.locked && <PlanBadge gate={gate} inherit />}
    </Button>
  );
}

// Icon button in a table row: a lock replaces the icon and the title names the plan (a pill per row would be too wide).
export function GateIconButton({ gate, icon, title, onClick }) {
  const g = usePlanGate(gate);
  const { names } = usePlan();
  const shown = g.locked ? `${title} (${names[g.minPlan] || g.minName})` : title;
  return (
    <button type="button" title={shown} aria-label={shown} onClick={g.locked ? g.open : onClick}
      data-gate={gate} data-plan-locked={g.locked ? g.minPlan : undefined}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors text-muted hover:text-ink hover:bg-wash">
      <Icon name={g.locked ? 'lock' : icon} size={15} />
    </button>
  );
}
