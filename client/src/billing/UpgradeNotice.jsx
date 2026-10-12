import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { Card } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../auth/i18n.js';
import { useBilling, FEATURE_PLAN, PLAN_NAMES } from './useBilling.js';

// Shown in place of a page that the current plan does not include (the server answers 402 to its API calls too).
export function UpgradeNotice({ feature, title }) {
  const { t } = useT();
  const need = PLAN_NAMES[FEATURE_PLAN[feature]] || 'Essential';
  return (
    <Layout title={title}>
      <Card className="max-w-xl mx-auto p-8 text-center" data-testid="upgrade-notice">
        <div className="w-12 h-12 rounded-full bg-brandTint text-brand flex items-center justify-center mx-auto mb-4"><Icon name="lock" size={20} /></div>
        <h2 className="text-lg font-semibold text-ink mb-1.5">{t('This area is not in your plan')}</h2>
        <p className="text-sm text-muted mb-5">{t('{name} is available from the {plan} plan. Upgrade to turn it on - your data stays as it is.', { name: title, plan: t(need) })}</p>
        <Link to="/settings?plan=1" className="inline-flex items-center justify-center rounded-md bg-brand text-white font-semibold text-sm px-4 py-2 hover:bg-brand/90">{t('See plans')}</Link>
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
