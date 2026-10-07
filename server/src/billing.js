// Planos e cobrança: Impact Digital cobra esta instalação (uma assinatura por instalação, linha única id=1).
// Chama a API REST do Stripe direto (fetch), sem o SDK, igual aos outros produtos do portfólio.
// Chaves de plano seguem o portfólio (basico / essencial / completo) porque o robô de provisionamento do Harbor
// grava LICENSED_PLAN com esses nomes; o nome mostrado na tela vem de planConfig.js.
import crypto from 'node:crypto';
import { get, run } from './db.js';
import { PLAN_RANK, PLAN_LABELS, PLAN_PRICES, PLAN_USER_LIMITS, FEATURE_MIN_PLAN, API_GATES, PLAN_EXTRA_LIMITS } from './planConfig.js';

export { PLAN_RANK, PLAN_LABELS, PLAN_PRICES, PLAN_USER_LIMITS, FEATURE_MIN_PLAN };

const PRICE_ENV_BY_PLAN = { basico: 'STRIPE_PRICE_BASICO', essencial: 'STRIPE_PRICE_ESSENCIAL', completo: 'STRIPE_PRICE_COMPLETO' };
// Anual: preço cobrado uma vez por ano, 10% abaixo de 12 mensalidades. Sem a variável, "Anual" não aparece.
export const ANNUAL_DISCOUNT = 0.1;
const YEARLY_PRICE_ENV_BY_PLAN = { basico: 'STRIPE_PRICE_BASICO_ANUAL', essencial: 'STRIPE_PRICE_ESSENCIAL_ANUAL', completo: 'STRIPE_PRICE_COMPLETO_ANUAL' };
const PAYMENT_LINK_ENV_BY_PLAN = { basico: 'STRIPE_PAYMENT_LINK_BASICO', essencial: 'STRIPE_PAYMENT_LINK_ESSENCIAL', completo: 'STRIPE_PAYMENT_LINK_COMPLETO' };
const YEARLY_PAYMENT_LINK_ENV_BY_PLAN = { basico: 'STRIPE_PAYMENT_LINK_BASICO_ANUAL', essencial: 'STRIPE_PAYMENT_LINK_ESSENCIAL_ANUAL', completo: 'STRIPE_PAYMENT_LINK_COMPLETO_ANUAL' };

const stripeBase = () => process.env.STRIPE_API_BASE || 'https://api.stripe.com/v1';
export const normalizeInterval = (v) => (v === 'year' ? 'year' : 'month');
export const isConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export const annualPrice = (plan) => Math.round(PLAN_PRICES[plan] * 12 * (1 - ANNUAL_DISCOUNT));

function priceIdFor(plan, interval = 'month') {
  const table = normalizeInterval(interval) === 'year' ? YEARLY_PRICE_ENV_BY_PLAN : PRICE_ENV_BY_PLAN;
  return table[plan] ? process.env[table[plan]] : null;
}
export function yearlyPlans() {
  return Object.entries(YEARLY_PRICE_ENV_BY_PLAN).filter(([, k]) => !!process.env[k]).map(([p]) => p);
}
export function monthlyPlans() {
  return Object.entries(PRICE_ENV_BY_PLAN).filter(([, k]) => !!process.env[k]).map(([p]) => p);
}
export function getPaymentLinks(interval = 'month') {
  const table = normalizeInterval(interval) === 'year' ? YEARLY_PAYMENT_LINK_ENV_BY_PLAN : PAYMENT_LINK_ENV_BY_PLAN;
  const links = {};
  for (const [plan, k] of Object.entries(table)) if (process.env[k]) links[plan] = process.env[k];
  return links;
}

async function stripeRequest(path, params) {
  const res = await fetch(`${stripeBase()}/${path}`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Stripe request failed.');
  return data;
}
async function stripeGet(path) {
  const res = await fetch(`${stripeBase()}/${path}`, { headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64') } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Stripe request failed.');
  return data;
}

export async function getSubscription() {
  const row = await get(`SELECT * FROM subscription WHERE id = 1`);
  if (row) return row;
  await run(`INSERT INTO subscription (id, plan, status) VALUES (1, 'basico', 'active') ON CONFLICT (id) DO NOTHING`);
  return get(`SELECT * FROM subscription WHERE id = 1`);
}

// Plano que o robô de provisionamento da Impact Digital grava (LICENSED_PLAN) em instalações de clientes.
export function licensedPlan() {
  const p = process.env.LICENSED_PLAN;
  return p && PLAN_RANK[p] ? p : null;
}

// Plano em vigor. Só vale limite onde há cobrança de verdade: sem Stripe configurado, ou sem assinatura do
// Stripe por trás (instância da Impact Digital, demonstração, instalação manual) tudo fica liberado,
// para uma instalação nunca se trancar sozinha. LICENSED_PLAN sempre ganha.
export async function effectivePlan() {
  const licensed = licensedPlan();
  if (licensed) return licensed;
  if (!isConfigured()) return 'completo';
  const sub = await getSubscription();
  if (!sub.stripe_subscription_id) return 'completo';
  if (!['active', 'trialing', 'past_due'].includes(sub.status)) return 'basico';
  return PLAN_RANK[sub.plan] ? sub.plan : 'basico';
}

export const planAllows = async (min) => PLAN_RANK[await effectivePlan()] >= PLAN_RANK[min];
export const allowsFeature = (plan, feature) => PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature] || 'basico'];

export function requirePlan(minPlan) {
  return async (req, res, next) => {
    try {
      const current = await effectivePlan();
      if (PLAN_RANK[current] < PLAN_RANK[minPlan]) {
        return res.status(402).json({ error: `This feature requires the ${PLAN_LABELS[minPlan]} plan or higher.`, code: 'plan_required', currentPlan: current, requiredPlan: minPlan });
      }
      next();
    } catch (e) { next(e); }
  };
}

// Barreira por rota: cada prefixo de API de planConfig.API_GATES exige o plano do recurso (monte depois do login).
export function planGates() {
  return async (req, res, next) => {
    try {
      const hit = API_GATES.find(([prefix]) => req.path === prefix || req.path.startsWith(prefix + '/'));
      if (!hit) return next();
      const feature = hit[1];
      const min = FEATURE_MIN_PLAN[feature] || 'basico';
      const current = await effectivePlan();
      if (PLAN_RANK[current] < PLAN_RANK[min]) {
        return res.status(402).json({ error: `This feature requires the ${PLAN_LABELS[min]} plan or higher.`, code: 'plan_required', feature, currentPlan: current, requiredPlan: min });
      }
      next();
    } catch (e) { next(e); }
  };
}

export async function userLimit() {
  return PLAN_USER_LIMITS[await effectivePlan()];
}
// Limite extra de um tipo de registro (ex.: alunos no Cohort). Infinity quando o produto não define.
export async function extraLimit(kind) {
  const table = (PLAN_EXTRA_LIMITS || {})[kind];
  return table ? table[await effectivePlan()] : Infinity;
}

export async function status() {
  const sub = await getSubscription();
  const plan = await effectivePlan();
  const { n } = await get(`SELECT COUNT(*)::int AS n FROM accounts`);
  const features = {};
  for (const f of Object.keys(FEATURE_MIN_PLAN)) features[f] = allowsFeature(plan, f);
  const lim = PLAN_USER_LIMITS[plan];
  return {
    configured: isConfigured(),
    licensed: !!licensedPlan(),
    plan,
    subscribedPlan: licensedPlan() || sub.plan,
    status: sub.status,
    users: n,
    userLimit: Number.isFinite(lim) ? lim : null,
    features,
    featureMinPlan: FEATURE_MIN_PLAN,
    plans: Object.keys(PLAN_RANK).map((id) => ({ id, label: PLAN_LABELS[id], monthly: PLAN_PRICES[id], yearly: annualPrice(id), userLimit: Number.isFinite(PLAN_USER_LIMITS[id]) ? PLAN_USER_LIMITS[id] : null, available: !!priceIdFor(id, 'month') || !!getPaymentLinks()[id] })),
    paymentLinks: getPaymentLinks(),
    paymentLinksYearly: getPaymentLinks('year'),
    yearlyPlans: yearlyPlans(),
    annualDiscount: ANNUAL_DISCOUNT,
  };
}

export async function createCheckoutSession(plan, { frontendBaseUrl, interval = 'month' }) {
  if (licensedPlan()) throw new Error('Your plan is managed by Impact Digital. Contact support to change it.');
  if (!isConfigured()) throw new Error('Billing is not configured on this server.');
  if (!PLAN_RANK[plan]) throw new Error('Unknown plan.');
  interval = normalizeInterval(interval);
  const priceId = priceIdFor(plan, interval);
  if (!priceId) throw new Error(interval === 'year' ? `No yearly Stripe price configured for the ${PLAN_LABELS[plan]} plan.` : `No Stripe price configured for the ${PLAN_LABELS[plan]} plan.`);
  const sub = await getSubscription();
  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', `${frontendBaseUrl}/#/settings?billing=success`);
  params.append('cancel_url', `${frontendBaseUrl}/#/settings?billing=cancelled`);
  if (sub.stripe_customer_id) params.append('customer', sub.stripe_customer_id);
  for (const prefix of ['metadata', 'subscription_data[metadata]']) {
    params.append(`${prefix}[plan]`, plan);
    params.append(`${prefix}[interval]`, interval);
  }
  return (await stripeRequest('checkout/sessions', params)).url;
}

export async function createPortalSession({ frontendBaseUrl }) {
  if (!isConfigured()) throw new Error('Billing is not configured on this server.');
  const sub = await getSubscription();
  if (!sub.stripe_customer_id) throw new Error('No active subscription to manage yet.');
  const params = new URLSearchParams();
  params.append('customer', sub.stripe_customer_id);
  params.append('return_url', `${frontendBaseUrl}/#/settings`);
  return (await stripeRequest('billing_portal/sessions', params)).url;
}

// Resumo para o Harbor (painel interno da Impact Digital): lê o estado real no Stripe.
export async function getAdminSummary() {
  const sub = await getSubscription();
  if (!isConfigured() || !sub.stripe_subscription_id) return { subscribers: [], billingEnabled: isConfigured() };
  try {
    const [subscription, customer] = await Promise.all([
      stripeGet(`subscriptions/${sub.stripe_subscription_id}`),
      sub.stripe_customer_id ? stripeGet(`customers/${sub.stripe_customer_id}`) : Promise.resolve(null),
    ]);
    const price = subscription.items?.data?.[0]?.price;
    return {
      subscribers: [{
        email: customer?.email || null, plan: sub.plan, status: subscription.status, interval: price?.recurring?.interval || null,
        amount: typeof price?.unit_amount === 'number' ? price.unit_amount / 100 : null,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
      }],
      billingEnabled: true,
    };
  } catch {
    return { subscribers: [{ email: null, plan: sub.plan, status: 'unknown', interval: null, amount: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null }], billingEnabled: true };
  }
}

export function planFromPriceId(priceId) {
  if (!priceId) return null;
  for (const table of [PRICE_ENV_BY_PLAN, YEARLY_PRICE_ENV_BY_PLAN]) {
    for (const [plan, k] of Object.entries(table)) if (process.env[k] === priceId) return plan;
  }
  return null;
}

function verifyWebhookSignature(rawBody, header, secret) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false; // evento antigo repetido
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${Buffer.from(rawBody).toString('utf8')}`).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parts.v1, 'hex')); } catch { return false; }
}

export async function handleWebhook(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set.');
  if (!rawBody || !verifyWebhookSignature(rawBody, signatureHeader, secret)) throw new Error('Invalid webhook signature.');
  const event = JSON.parse(Buffer.from(rawBody).toString('utf8'));
  const obj = event.data?.object;
  if (!obj) return;
  if (event.type === 'checkout.session.completed') {
    let plan = obj.metadata?.plan;
    if (!plan) {
      try {
        const li = await stripeGet(`checkout/sessions/${obj.id}/line_items`);
        plan = planFromPriceId(li.data?.[0]?.price?.id);
      } catch { /* cai no plano de entrada abaixo */ }
    }
    await run(
      `INSERT INTO subscription (id, plan, status, stripe_customer_id, stripe_subscription_id, updated_at)
       VALUES (1, $1, 'active', $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET plan = excluded.plan, status = excluded.status, stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id, updated_at = now()`,
      [PLAN_RANK[plan] ? plan : 'basico', obj.customer, obj.subscription]
    );
  } else if (event.type === 'customer.subscription.updated') {
    const plan = obj.metadata?.plan || planFromPriceId(obj.items?.data?.[0]?.price?.id);
    await run(`UPDATE subscription SET plan = COALESCE($1, plan), status = $2, updated_at = now() WHERE stripe_subscription_id = $3`, [PLAN_RANK[plan] ? plan : null, obj.status, obj.id]);
  } else if (event.type === 'customer.subscription.deleted') {
    await run(`UPDATE subscription SET status = 'canceled', updated_at = now() WHERE stripe_subscription_id = $1`, [obj.id]);
  }
}
