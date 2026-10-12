import { useEffect, useState } from 'react';
import api from '../api.js';
import { Card, CardHead, Badge, Button } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../auth/i18n.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useBilling, refreshBilling, PLAN_NAMES } from './useBilling.js';

const PLAN_ORDER = ['basico', 'essencial', 'completo'];
// What each plan includes (the lists are cumulative; "Everything in ..." keeps them short).
const FEATURES = {
  basico: ['Clients, jobs, candidates, pipeline and interviews', 'Up to {users} logins, {candidates} candidates, {openJobs} open jobs', 'Import from photo and simple resume reading', '2 automations that really run', 'English, Portuguese and Spanish'],
  essencial: ['Everything in Basic', 'Up to {users} logins, unlimited candidates and open jobs', 'Timesheets, margin per placement and invoices', 'WhatsApp inbox for the whole team', 'Unlimited automations'],
  completo: ['Everything in Essential', 'Up to {users} logins', 'Priority for new tools: AI, e-signature, payroll export', 'All future Complete tools included'],
};
const LIMITS_BY_PLAN = { basico: { users: 3, candidates: '1,000', openJobs: 25 }, essencial: { users: 8 }, completo: { users: 25 } };
const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

function Meter({ label, used, limit }) {
  const { t } = useT();
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-muted mb-1"><span>{t(label)}</span><span data-testid={`usage-${label}`}>{used}{limit ? ` / ${limit}` : ` (${t('no limit')})`}</span></div>
      <div className="h-1.5 rounded-full bg-wash overflow-hidden"><div className={`h-full ${pct >= 100 ? 'bg-rose' : 'bg-brand'}`} style={{ width: `${limit ? pct : 4}%` }} /></div>
    </div>
  );
}

export default function PlanCard() {
  const { t } = useT();
  const { account } = useAuth();
  const { billing } = useBilling();
  const [interval, setInterval_] = useState('month');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const owner = account?.role === 'owner';

  useEffect(() => {
    refreshBilling();
    // Back from Stripe: the webhook may take a few seconds, so ask again a few times.
    if (/billing=success/.test(window.location.hash)) {
      let n = 0;
      const h = setInterval(() => { refreshBilling(); if (++n >= 5) clearInterval(h); }, 2500);
      return () => clearInterval(h);
    }
    return undefined;
  }, []);
  if (!billing) return <Card className="p-5 lg:col-span-2" data-testid="plan-card"><p className="text-sm text-muted">{t('Loading…')}</p></Card>;

  const hasYearly = Object.values(billing.yearlyAvailable || {}).some(Boolean);
  const paying = billing.source === 'stripe';
  const licensed = billing.source === 'licensed';
  const showToggle = billing.configured && !licensed && !paying && hasYearly;
  const yearly = (showToggle && interval === 'year') || (paying && billing.interval === 'year');

  async function subscribe(plan) {
    setBusy(plan); setError('');
    try {
      const { url } = await api.billingCheckout(plan, yearly ? 'year' : 'month');
      window.location.href = url;
    } catch (err) {
      setError(err.status === 400 && /yearly price/i.test(err.message) ? t('The yearly price of this plan is not available yet.') : t('Online payment is not available right now. Please contact support.'));
      setBusy('');
    }
  }
  async function portal() {
    setBusy('portal'); setError('');
    try { window.location.href = (await api.billingPortal()).url; } catch { setError(t('Online payment is not available right now. Please contact support.')); setBusy(''); }
  }

  const u = billing.usage || {}, l = billing.limits || {};
  return (
    <Card className="p-1 lg:col-span-2" id="plan" data-testid="plan-card">
      <CardHead
        title={t('Plan & billing')}
        sub={licensed ? t('Your plan is managed by Impact Digital.') : paying ? `${t(PLAN_NAMES[billing.plan])} · ${billing.interval === 'year' ? t('yearly') : t('monthly')}` : t('Choose the plan that fits your agency')}
        action={owner && billing.hasCustomer ? <Button size="sm" variant="outline" onClick={portal} disabled={!!busy}>{t('Manage billing and invoices')}</Button> : null}
      />
      <div className="px-5 pb-5 space-y-4">
        {/billing=success/.test(window.location.hash) && <p className="rounded-md bg-greenTint text-green text-sm px-3 py-2" data-testid="billing-success">{t('Payment received. Updating your plan…')}</p>}
        {billing.status === 'past_due' && <p className="rounded-md bg-roseTint text-rose text-sm px-3 py-2">{t('Your last payment failed. Update your payment method to keep your plan.')}</p>}
        {billing.status === 'canceled' && <p className="rounded-md bg-amber-50 text-amber-800 text-sm px-3 py-2">{t('Your subscription ended. You are on the Basic limits; nothing was deleted.')}</p>}
        {showToggle && (
          <div>
            <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label={t('Billing period')}>
              {[['month', t('Monthly')], ['year', t('Yearly (−10%)')]].map(([id, label]) => (
                <button key={id} type="button" data-testid={`billing-interval-${id}`} aria-pressed={interval === id} onClick={() => setInterval_(id)}
                  className={`h-8 rounded-md px-3 text-sm font-semibold ${interval === id ? 'bg-brand text-white' : 'text-ink'}`}>{label}</button>))}
            </div>
            {interval === 'year' && <p className="mt-2 text-xs text-muted" data-testid="yearly-note">{t('Yearly plan: you pay once for 12 months. You can cancel renewal at any time; unused months are not refunded, and access continues until the end of the year you paid for. We email you before it renews.')}</p>}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3" data-testid="plans-grid">
          {PLAN_ORDER.map((p) => {
            const current = billing.plan === p && (licensed || paying || !billing.configured);
            const price = billing.prices[p];
            const showYear = yearly;
            const rank = PLAN_ORDER.indexOf(p) - PLAN_ORDER.indexOf(billing.plan);
            return (
              <div key={p} className={`rounded-lg border p-4 ${current ? 'border-brand ring-1 ring-brand' : 'border-line'}`}>
                <div className="flex items-baseline justify-between"><h3 className="text-base font-semibold text-ink">{t(PLAN_NAMES[p])}</h3>{current && <Badge tone="brand">{t('Your plan')}</Badge>}</div>
                <div className="my-2 text-3xl font-bold text-ink" data-testid={`plan-price-${p}`}>{showYear ? usd(price.year) : usd(price.month)}<span className="text-sm font-normal text-muted">/{showYear ? t('year') : t('month')}</span></div>
                {showYear && <p className="-mt-1 mb-2 text-xs text-muted">{t('equals {0}/month · 10% off', { 0: usd(Math.round(price.year / 12 * 100) / 100) })}</p>}
                <ul className="space-y-1.5 text-sm text-muted mb-3">
                  {FEATURES[p].map((f) => <li key={f}>✓ {t(f, LIMITS_BY_PLAN[p])}</li>)}
                </ul>
                {owner && !licensed && !current && billing.configured && !paying && (
                  <Button className="w-full" onClick={() => subscribe(p)} disabled={!!busy || (showYear && !billing.yearlyAvailable?.[p])} data-testid={`subscribe-${p}`}>
                    {showYear && !billing.yearlyAvailable?.[p] ? t('Yearly coming soon') : t('Subscribe')}
                  </Button>
                )}
                {owner && paying && !current && billing.hasCustomer && (
                  <Button className="w-full" variant={rank > 0 ? 'primary' : 'outline'} onClick={portal} disabled={!!busy}>{rank > 0 ? t('Upgrade') : t('Change plan')}</Button>
                )}
              </div>
            );
          })}
        </div>
        {error && <p className="rounded-md bg-roseTint text-rose text-sm px-3 py-2" role="alert">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meter label="Logins" used={u.users ?? 0} limit={l.users} />
          <Meter label="Candidates" used={u.candidates ?? 0} limit={l.candidates} />
          <Meter label="Open jobs" used={u.openJobs ?? 0} limit={l.openJobs} />
          <Meter label="Active automations" used={u.automations ?? 0} limit={l.automations} />
        </div>
        {!billing.configured && !licensed && <p className="text-xs text-faint"><Icon name="lock" size={11} /> {t('Online billing is not connected on this installation, so every feature is open.')}</p>}
      </div>
    </Card>
  );
}
