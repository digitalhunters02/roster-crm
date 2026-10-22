// /api/billing/*: plan, usage and limits for the screen, Stripe Checkout, customer portal and the Stripe webhook.
// The webhook is public (Stripe calls it, the signature is checked); everything else needs a login and only the
// owner can start a purchase or open the portal.
import { get } from './db.js';
import { requireOwner } from './auth.js';
import { isOwnerEmail } from './owner.js';
import { blockInPreview } from './previewPlan.js';
import {
  PLAN_RANK, PLAN_LABELS, PLAN_LIMITS, FEATURE_MIN_PLAN, ANNUAL_DISCOUNT, isConfigured, effectivePlan, realPlan, previewingPlan, getSubscription,
  licensedPlan, getPaymentLinks, yearlyAvailable, priceTable, featuresFor, createCheckoutSession, createPortalSession, handleWebhook,
  normalizeInterval, publicCatalog, publicGates, seatGateFor,
} from './billing.js';

const lim = (n) => (n === Infinity ? null : n);

export async function usage() {
  const n = async (sql) => Number((await get(sql)).n) || 0;
  return {
    users: await n(`SELECT COUNT(*) AS n FROM accounts WHERE is_demo_trial = FALSE`),
    candidates: await n(`SELECT COUNT(*) AS n FROM candidates`),
    openJobs: await n(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'Open'`),
    automations: await n(`SELECT COUNT(*) AS n FROM automations WHERE active = 1`),
  };
}

export async function billingStatus() {
  const plan = await effectivePlan();
  const sub = await getSubscription();
  const licensed = licensedPlan();
  const limits = Object.fromEntries(Object.entries(PLAN_LIMITS[plan]).map(([k, v]) => [k, lim(v)]));
  const used = await usage();
  return {
    configured: isConfigured(),
    plan,
    planLabel: PLAN_LABELS[plan],
    // Plan fixed by Impact Digital's provisioning (cannot be changed here) / paying through Stripe / not limited.
    source: licensed ? 'licensed' : (isConfigured() && sub.stripe_subscription_id ? 'stripe' : 'open'),
    status: sub.stripe_subscription_id ? sub.status : null,
    interval: sub.stripe_subscription_id ? sub.billing_interval : null,
    hasCustomer: !!sub.stripe_customer_id,
    prices: priceTable(),
    annualDiscount: ANNUAL_DISCOUNT,
    yearlyAvailable: yearlyAvailable(),
    paymentLinks: getPaymentLinks('month'),
    paymentLinksYearly: getPaymentLinks('year'),
    limits,
    usage: used,
    features: featuresFor(plan),
    featureMinPlan: FEATURE_MIN_PLAN,
    order: Object.keys(PLAN_RANK),
    // Selo de plano (menu, botões, janelinha "Disponível no plano X"): a mesma fonte para tudo; o front só consome.
    // previewPlan = plano que o dono da plataforma está VENDO ("Ver como plano"); realPlan = o plano de verdade da instalação.
    previewPlan: previewingPlan(),
    realPlan: await realPlan(),
    gates: publicGates(plan),
    catalog: publicCatalog(),
    userGate: seatGateFor(plan, used.users),
  };
}

function baseUrl(req) {
  return (process.env.FRONTEND_URL || req.get('origin') || `${req.protocol}://${req.get('host')}`).split(',')[0].trim().replace(/\/+$/, '');
}

// Stripe calls this directly: mounted before the login gate.
export function publicBillingRoutes(app, ar) {
  // Planos à venda (preço, o que cada plano acrescenta e o plano mínimo de cada recurso), sem login: a mesma fonte do app logado.
  app.get('/api/public/plans', ar(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ catalog: publicCatalog(), gates: publicGates() });
  }));

  app.post('/api/billing/webhook', ar(async (req, res) => {
    try {
      await handleWebhook(req.rawBody || '', req.headers['stripe-signature']);
      res.json({ received: true });
    } catch (e) {
      console.error('Stripe webhook:', e.message);
      res.status(400).json({ error: e.message });
    }
  }));
}

export function billingRoutes(app, ar) {
  // `owner` = a conta é de dono da plataforma (OWNER_EMAILS): o front mostra o "Ver como plano".
  app.get('/api/billing/status', ar(async (req, res) => res.json({ ...(await billingStatus()), owner: isOwnerEmail(req.account?.email) })));

  app.post('/api/billing/checkout', requireOwner, blockInPreview, ar(async (req, res) => {
    if (licensedPlan()) return res.status(400).json({ error: 'Your plan is managed by Impact Digital. Contact support to change it.', code: 'plan_licensed' });
    const plan = req.body?.plan;
    if (!PLAN_RANK[plan]) return res.status(400).json({ error: 'Unknown plan.', code: 'unknown_plan' });
    try {
      const url = await createCheckoutSession(plan, { frontendBaseUrl: baseUrl(req), interval: normalizeInterval(req.body?.interval) });
      res.json({ url });
    } catch (e) {
      res.status(400).json({ error: e.message, code: 'checkout_unavailable' });
    }
  }));

  app.post('/api/billing/portal', requireOwner, blockInPreview, ar(async (req, res) => {
    try {
      res.json({ url: await createPortalSession({ frontendBaseUrl: baseUrl(req) }) });
    } catch (e) {
      res.status(400).json({ error: e.message, code: 'portal_unavailable' });
    }
  }));
}
