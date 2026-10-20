import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, CardHead, Badge, Button } from '../components/ui.jsx';
import { usePlan } from './PlanContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../auth/i18n.js';
import PlanBadge from '../planKit/PlanBadge.jsx';
import { planStr, planFill, planMoney, gateText } from '../planKit/planStrings.js';
import { planCardStr } from './planCardStrings.js';

// Cartões de plano (mensal / anual -10%) + gerenciar assinatura. Só o dono escolhe plano.
// Cada plano aparece com o SELO + preço; os recursos que ele ACRESCENTA em relação ao anterior (vindos do servidor) levam o selo do plano onde entram.

export default function PlansCard() {
  const { billing, refresh, names } = usePlan();
  const { lang } = useT();
  const ps = planStr(lang);
  const cs = planCardStr(lang);
  const { account } = useAuth();
  const [interval, setIntervalV] = useState('month');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const isOwner = account?.role === 'owner';

  useEffect(() => {
    const q = new URLSearchParams((window.location.hash.split('?')[1]) || '').get('billing');
    if (q === 'success') { refresh(); setTimeout(refresh, 4000); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!billing) return null;
  const yearlyOk = (billing.yearlyPlans || []).length > 0;
  const yearly = interval === 'year' && yearlyOk;
  const paid = billing.configured && billing.subscribedPlan && billing.status === 'active';
  const previewing = !!billing.previewPlan; // o dono da plataforma está vendo como outro plano: nada de assinar nem gerenciar

  async function choose(plan) {
    setBusy(plan); setError('');
    try {
      const link = (yearly ? billing.paymentLinksYearly : billing.paymentLinks)?.[plan];
      if (link) { window.location.href = link; return; }
      const { url } = await api.billingCheckout(plan, yearly ? 'year' : 'month');
      window.location.href = url;
    } catch (e) { setError(e.message); setBusy(null); }
  }
  async function manage() {
    setBusy('manage'); setError('');
    try { const { url } = await api.billingPortal(); window.location.href = url; } catch (e) { setError(e.message); setBusy(null); }
  }

  const current = billing.plan;
  const nameOf = (id) => names?.[id] || billing.plans.find((p) => p.id === id)?.label || id;
  const currentLabel = nameOf(current);
  const catalog = billing.catalog || [];
  return (
    <Card id="billing" className="p-1">
      <CardHead
        title="Plan & billing"
        sub={billing.licensed ? `Your plan: ${currentLabel} · managed by Impact Digital (contact support to change it)` : billing.configured ? `Your plan: ${currentLabel}${billing.status !== 'active' ? ` (${billing.status})` : ''}` : 'Billing is not set up on this server, so every feature is unlocked.'}
        action={isOwner && paid && !previewing ? <Button variant="outline" size="sm" disabled={busy === 'manage'} onClick={manage}>{busy === 'manage' ? '…' : 'Manage subscription'}</Button> : null}
      />
      <div className="px-5 pb-5">
        <p className="text-xs text-muted mb-3">
          Staff logins: {billing.users}{billing.userLimit ? ` of ${billing.userLimit}` : ' (unlimited)'}
        </p>
        {previewing && <p className="mb-3 text-xs text-brand font-semibold" data-testid="plans-preview-note">{planFill(ps.previewViewing, { app: 'Roster', plan: currentLabel })} {ps.previewBlocked}</p>}
        {error && <div className="mb-3 text-xs text-rose bg-roseTint border border-rose/30 rounded-lg px-3 py-2">{error}</div>}
        {yearlyOk && (
          <div className="flex gap-2 mb-4" role="group" aria-label="Billing period">
            {[['month', 'Monthly'], ['year', 'Yearly · save 10%']].map(([k, label]) => (
              <button key={k} type="button" aria-pressed={interval === k} onClick={() => setIntervalV(k)}
                className={`h-8 px-3 rounded-full text-xs font-semibold border ${interval === k ? 'border-brand bg-brandTint text-brand' : 'border-line text-muted'}`}>{label}</button>
            ))}
          </div>
        )}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {billing.plans.map((p) => {
            const isCurrent = current === p.id;
            const price = yearly ? p.yearly : p.monthly;
            const canBuy = !previewing && isOwner && billing.configured && !billing.licensed && (p.available && (!yearly || billing.yearlyPlans.includes(p.id)));
            const ci = catalog.findIndex((c) => c.key === p.id);
            const prev = ci > 0 ? catalog[ci - 1] : null;
            const adds = ((ci >= 0 ? catalog[ci].adds : []) || []).filter((g) => gateText(g, lang));
            return (
              <div key={p.id} data-plan-card={p.id} className={`rounded-xl border p-4 flex flex-col ${isCurrent ? 'border-brand bg-brandTint/30' : 'border-line'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink text-sm min-w-0">{nameOf(p.id)}<PlanBadge plan={p.id} /></span>
                  {isCurrent && <Badge tone="brand">{cs.thisIsCurrent}</Badge>}
                </div>
                <div className="mt-1.5 text-2xl font-bold text-ink" data-testid={`plan-price-${p.id}`}>{planMoney(price, lang, 'USD')}<span className="text-xs font-normal text-muted">{yearly ? cs.perYear : cs.perMonth}</span></div>
                <ul className="mt-3 mb-4 space-y-1 text-xs text-muted flex-1">
                  <li>• {p.userLimit ? planFill(cs.staffUpTo, { n: p.userLimit }) : cs.staffUnlimited}</li>
                  {prev && adds.length > 0 && (
                    <li data-plan-adds={p.id} className="list-none -ml-0 mt-2 pt-2 border-t border-lineSoft">
                      <div className="text-[11px] text-faint mb-1">{planFill(ps.everythingIn, { prev: nameOf(prev.key) })}</div>
                      <ul className="space-y-1 list-none p-0 m-0">
                        {adds.map((g) => (
                          <li key={g} data-add={g} className="flex flex-wrap items-center text-ink"><span className="min-w-0">{gateText(g, lang).name}</span><PlanBadge plan={p.id} /></li>
                        ))}
                      </ul>
                    </li>
                  )}
                </ul>
                {!isCurrent && (
                  <Button variant="brand" size="sm" className="justify-center" disabled={!canBuy || busy === p.id} onClick={() => choose(p.id)}>
                    {busy === p.id ? '…' : canBuy ? 'Choose plan' : p.available || !billing.configured ? 'Choose plan' : 'Coming soon'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
