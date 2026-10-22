import Layout from '../components/Layout.jsx';
import { Card } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../auth/i18n.js';
import { useBilling } from './useBilling.js';
import PlanBadge, { usePlanGate } from '../planKit/PlanBadge.jsx';
import { gateText, planStr } from '../planKit/planStrings.js';

// Shown in place of a page that the current plan does not include (the server answers 402 to its API calls too).
// It names the feature with the SEAL of the plan that unlocks it; the button opens the "Available on the X plan" window.
export function UpgradeNotice({ feature, title }) {
  const { t, lang } = useT();
  const gate = usePlanGate(feature);
  const text = gateText(feature, lang);
  return (
    <Layout title={title}>
      <Card className="max-w-xl mx-auto p-8 text-center" data-testid="upgrade-notice" data-plan-notice={feature}>
        <div className="w-12 h-12 rounded-full bg-brandTint text-brand flex items-center justify-center mx-auto mb-4"><Icon name="lock" size={20} /></div>
        <h2 className="text-lg font-semibold text-ink mb-1.5">{t('This area is not in your plan')}<PlanBadge gate={feature} /></h2>
        <p className="text-sm text-muted mb-5">{text ? text.what : title}</p>
        <button type="button" onClick={gate.open} data-testid="plan-notice-open" className="inline-flex items-center justify-center min-h-[40px] rounded-md bg-brand text-white font-semibold text-sm px-4 py-2 hover:bg-brand/90">{planStr(lang).details}</button>
      </Card>
    </Layout>
  );
}

// Returns the notice element when `feature` is locked for the current plan, otherwise null.
export function useFeatureGate(feature, title) {
  const { billing } = useBilling();
  if (billing && billing.features && billing.features[feature] === false) return <UpgradeNotice feature={feature} title={title} />;
  return null;
}
