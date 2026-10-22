// Subscription billing — Impact Digital's own Stripe account (not a per-agency "connect your own",
// unlike WhatsApp), since this bills the agency for the Roster subscription itself.
// One subscription per deployment (singleton row, id=1), same pattern as Parcel/whatsapp_connection. Calls Stripe's REST API directly via fetch, same
// approach as Binder's stripeBilling.js — no `stripe` npm SDK.
import crypto from 'node:crypto';
import { get, run } from './db.js';
// Planos, preços, limites e o mapa recurso -> plano mínimo vêm de planConfig.js (fonte única); aqui ficam a cobrança,
// o plano em vigor e as barreiras. As chaves de plano continuam basico/essencial/completo (banco, metadados do Stripe, LICENSED_PLAN).
import { PLAN_RANK, PLAN_LABELS, PLAN_PRICES, PLAN_USER_LIMITS, PLAN_LIMITS, FEATURE_MIN_PLAN, API_GATES } from './planConfig.js';
import { store } from './owner.js';
import { makeGates } from './planGates.js';

export { PLAN_RANK, PLAN_LABELS, PLAN_PRICES, PLAN_USER_LIMITS, PLAN_LIMITS, FEATURE_MIN_PLAN };

// Todos os produtos da Impact Digital usam a MESMA conta do Stripe, e o Stripe manda cada evento a todos os
// webhooks cadastrados. Cada checkout leva a etiqueta do produto e cada webhook ignora o que é de outro produto.
export const PRODUCT = 'roster';

const PRICE_ENV_BY_PLAN = {
  basico: 'STRIPE_PRICE_BASICO',
  essencial: 'STRIPE_PRICE_ESSENCIAL',
  completo: 'STRIPE_PRICE_COMPLETO',
};

// Optional — a Stripe Payment Link is a ready-made checkout URL you create
// in the Stripe Dashboard (no API call needed), one per plan. When one is
// set, the frontend links the "Subscribe" button straight at it instead of
// asking the backend to create a Checkout Session.
const PAYMENT_LINK_ENV_BY_PLAN = {
  basico: 'STRIPE_PAYMENT_LINK_BASICO',
  essencial: 'STRIPE_PAYMENT_LINK_ESSENCIAL',
  completo: 'STRIPE_PAYMENT_LINK_COMPLETO',
};

// Yearly plan (Jadson's rule, all products): pay once, 12 monthly prices minus 10%. One yearly Stripe
// price per plan (STRIPE_PRICE_<PLAN>_ANUAL) and, optionally, a yearly Payment Link per plan
// (STRIPE_PAYMENT_LINK_<PLAN>_ANUAL).
export const ANNUAL_DISCOUNT = 0.1;
const YEARLY_PRICE_ENV_BY_PLAN = {
  basico: 'STRIPE_PRICE_BASICO_ANUAL',
  essencial: 'STRIPE_PRICE_ESSENCIAL_ANUAL',
  completo: 'STRIPE_PRICE_COMPLETO_ANUAL',
};
const YEARLY_PAYMENT_LINK_ENV_BY_PLAN = {
  basico: 'STRIPE_PAYMENT_LINK_BASICO_ANUAL',
  essencial: 'STRIPE_PAYMENT_LINK_ESSENCIAL_ANUAL',
  completo: 'STRIPE_PAYMENT_LINK_COMPLETO_ANUAL',
};
export const normalizeInterval = (v) => (['year', 'yearly', 'annual', 'anual'].includes(String(v || '').toLowerCase()) ? 'year' : 'month');
// 12 monthly prices minus 10%, rounded to the cent (e.g. 269 -> 2905.20).
export function annualPrice(plan) {
  return Math.round(PLAN_PRICES[plan] * 12 * (1 - ANNUAL_DISCOUNT) * 100) / 100;
}

export function isConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function priceIdFor(plan, interval = 'month') {
  const table = normalizeInterval(interval) === 'year' ? YEARLY_PRICE_ENV_BY_PLAN : PRICE_ENV_BY_PLAN;
  const envKey = table[plan];
  return envKey ? process.env[envKey] : null;
}

export function getPaymentLinks(interval = 'month') {
  const links = {};
  const table = normalizeInterval(interval) === 'year' ? YEARLY_PAYMENT_LINK_ENV_BY_PLAN : PAYMENT_LINK_ENV_BY_PLAN;
  for (const [plan, envKey] of Object.entries(table)) {
    if (process.env[envKey]) links[plan] = process.env[envKey];
  }
  return links;
}

// Which plans can already be bought yearly (a yearly Stripe price or Payment Link exists).
export function yearlyAvailable() {
  const links = getPaymentLinks('year');
  const out = {};
  for (const plan of Object.keys(PLAN_RANK)) out[plan] = !!(links[plan] || (isConfigured() && priceIdFor(plan, 'year')));
  return out;
}

// List prices for the screen: monthly and yearly total of each plan.
export function priceTable() {
  const out = {};
  for (const plan of Object.keys(PLAN_PRICES)) out[plan] = { month: PLAN_PRICES[plan], year: annualPrice(plan) };
  return out;
}

async function stripeRequest(path, params) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const res = await fetch(`${String(process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/+$/, '')}/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Stripe request failed.');
  return data;
}

async function stripeGet(path) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const res = await fetch(`${String(process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/+$/, '')}/v1/${path}`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64') },
  });
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

// Limites por plano (PLAN_LIMITS), recursos por plano (FEATURE_MIN_PLAN) e rotas protegidas (API_GATES): planConfig.js.
export const featuresFor = (plan) => Object.fromEntries(Object.entries(FEATURE_MIN_PLAN).map(([f, min]) => [f, PLAN_RANK[plan] >= PLAN_RANK[min]]));
export const allowsFeature = (plan, feature) => PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature] || 'basico'];

// ---- SELO DE PLANO: mapa recurso -> plano mínimo, calculado do catálogo (planConfig.js); o front só consome ----
// GATES: uma linha por recurso de FEATURE_MIN_PLAN (a função diz se o plano libera) + uma por vaga extra de login de equipe.
const PLANS_SOLD = Object.fromEntries(Object.keys(PLAN_RANK).map((key) => [key, { key, name: PLAN_LABELS[key], rank: PLAN_RANK[key], sold: true }]));
const PLAN_KEYS = Object.keys(PLAN_RANK).sort((a, b) => PLAN_RANK[a] - PLAN_RANK[b]);
// Vagas de login de equipe: um recurso "staff_<plano>" para cada plano cujo limite de logins é maior que o do plano de baixo.
const SEAT_GATES = Object.fromEntries(PLAN_KEYS.map((k, i) => [k, i > 0 && PLAN_USER_LIMITS[k] > PLAN_USER_LIMITS[PLAN_KEYS[i - 1]] ? `staff_${k}` : null]).filter(([, g]) => g).map(([k, g]) => [g, k]));
const SEAT_GATE_OF_PLAN = Object.fromEntries(Object.entries(SEAT_GATES).map(([g, k]) => [k, g]));
const GATES = {
  ...Object.fromEntries(Object.entries(FEATURE_MIN_PLAN).map(([feature, min]) => [feature, (p) => p.rank >= PLAN_RANK[min]])),
  ...Object.fromEntries(Object.entries(SEAT_GATES).map(([gate, min]) => [gate, (p) => p.rank >= PLAN_RANK[min]])),
};
const gates = makeGates(PLANS_SOLD, GATES, 'completo');
export const { minPlanForGate, publicGates } = gates;
// Recurso que destrava mais um login de equipe quando as vagas do plano acabaram (null se ainda há vaga ou não há plano maior).
export function seatGateFor(plan, used) {
  const lim = PLAN_USER_LIMITS[plan];
  if (!Number.isFinite(lim) || used < lim) return null;
  const next = PLAN_KEYS.find((k) => PLAN_RANK[k] > PLAN_RANK[plan] && PLAN_USER_LIMITS[k] > used);
  return (next && SEAT_GATE_OF_PLAN[next]) || null;
}

// The plan Impact Digital's provisioning robot sets (LICENSED_PLAN) on a
// customer install, or null on any other deployment.
export function licensedPlan() {
  const p = process.env.LICENSED_PLAN;
  return p && PLAN_RANK[p] ? p : null;
}

// Plano que o dono da plataforma está VENDO neste pedido ("Ver como plano"); null fora da prévia.
export function previewingPlan() {
  const p = store.getStore()?.plan;
  return p && PLAN_RANK[p] ? p : null;
}

// Plano de verdade da instalação (sem prévia). Limites só valem onde há cobrança de verdade: quando o Stripe não está
// configurado, ou a linha de assinatura não tem uma assinatura do Stripe por trás (a própria instância da Impact Digital,
// a demonstração, uma instalação manual), tudo fica liberado, para uma instalação nunca se trancar sozinha.
export async function realPlan() {
  // Set by Impact Digital's provisioning robot on customer installs it creates: the plan that customer bought,
  // which always wins over whatever this install's own subscription row says.
  const licensed = licensedPlan();
  if (licensed) return licensed;
  if (!isConfigured()) return 'completo';
  const sub = await getSubscription();
  if (!sub.stripe_subscription_id) return 'completo';
  // Assinatura cancelada, sem pagamento ou vencida cai nos limites do Basic (nada é apagado; só adicionar mais é barrado).
  if (!['active', 'trialing', 'past_due'].includes(sub.status)) return 'basico';
  return PLAN_RANK[sub.plan] ? sub.plan : 'basico';
}

// Plano em vigor: o do pedido em "Ver como plano" (só dono da plataforma, só dentro daquele pedido) ou o de verdade.
export async function effectivePlan() {
  return previewingPlan() || realPlan();
}

// `need` é um plano (basico/essencial/completo) OU um recurso de FEATURE_MIN_PLAN (ex.: 'portal', 'documents').
const minPlanOf = (need) => (PLAN_RANK[need] ? need : FEATURE_MIN_PLAN[need] || 'basico');

// Gates a route to accounts on at least the plan `need` (or the plan that unlocks the feature `need`).
export function requirePlan(need) {
  const minPlan = minPlanOf(need);
  const feature = PLAN_RANK[need] ? undefined : need;
  return async (req, res, next) => {
    try {
      const current = await effectivePlan();
      if (PLAN_RANK[current] < PLAN_RANK[minPlan]) {
        return res.status(402).json({
          error: `This feature requires the ${PLAN_LABELS[minPlan]} plan or higher.`,
          code: 'plan_required',
          ...(feature ? { feature } : {}),
          currentPlan: current,
          requiredPlan: minPlan,
        });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

// Barreira por rota: cada prefixo de API_GATES (planConfig.js) exige o plano do recurso (monte depois do login e da prévia).
export function planGates() {
  const gateFor = new Map(API_GATES.map(([prefix, feature]) => [prefix, requirePlan(feature)]));
  return (req, res, next) => {
    const hit = API_GATES.find(([prefix]) => req.path === prefix || req.path.startsWith(prefix + '/'));
    return hit ? gateFor.get(hit[0])(req, res, next) : next();
  };
}

export async function userLimit() {
  return PLAN_USER_LIMITS[await effectivePlan()];
}

// Rejects with 402 when `kind` ('candidates' | 'openJobs' | 'automations' | 'users') is already at the plan limit.
// `count` is an async function returning the current number.
export function enforceLimit(kind, count) {
  return async (req, res, next) => {
    try {
      const plan = await effectivePlan();
      const limit = PLAN_LIMITS[plan][kind];
      if (limit !== Infinity && (await count(req)) >= limit) {
        const need = Object.keys(PLAN_RANK).find((p) => PLAN_LIMITS[p][kind] > limit) || 'completo';
        return res.status(402).json({
          error: `Your ${PLAN_LABELS[plan]} plan allows up to ${limit} ${kind === 'openJobs' ? 'open jobs' : kind}. Upgrade to the ${PLAN_LABELS[need]} plan to add more.`,
          code: 'plan_limit', limitKind: kind, limit, currentPlan: plan, requiredPlan: need,
        });
      }
      next();
    } catch (e) { next(e); }
  };
}

// Catálogo para o front (selo de plano): ordem, preço (mensal sempre; anual só quando o preço anual existe), limite de logins
// e o que cada plano ACRESCENTA em relação ao anterior.
export function publicCatalog() {
  const adds = gates.addsByPlan();
  const yearly = yearlyAvailable();
  return PLAN_KEYS.map((key) => ({
    key, name: PLAN_LABELS[key], rank: PLAN_RANK[key],
    price: { month: PLAN_PRICES[key], ...(yearly[key] ? { year: annualPrice(key) } : {}) },
    userLimit: Number.isFinite(PLAN_USER_LIMITS[key]) ? PLAN_USER_LIMITS[key] : null,
    adds: adds[key] || [],
  }));
}

export async function createCheckoutSession(plan, { backendBaseUrl, frontendBaseUrl, interval = 'month' }) {
  if (!isConfigured()) throw new Error('Billing is not configured on this server.');
  if (!PLAN_RANK[plan]) throw new Error('Unknown plan.');
  const iv = normalizeInterval(interval);
  const priceId = priceIdFor(plan, iv);
  if (!priceId) {
    throw new Error(iv === 'year'
      ? `The yearly price for the ${PLAN_LABELS[plan] || plan} plan has not been created in Stripe yet.`
      : `No Stripe price configured for the ${PLAN_LABELS[plan] || plan} plan.`);
  }

  const sub = await getSubscription();
  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', `${frontendBaseUrl}/#/settings?billing=success`);
  params.append('cancel_url', `${frontendBaseUrl}/#/settings?billing=cancelled`);
  if (sub.stripe_customer_id) params.append('customer', sub.stripe_customer_id);
  params.append('metadata[plan]', plan);
  params.append('metadata[interval]', iv);
  params.append('metadata[product]', PRODUCT);
  params.append('subscription_data[metadata][plan]', plan);
  params.append('subscription_data[metadata][interval]', iv);
  params.append('subscription_data[metadata][product]', PRODUCT);

  const session = await stripeRequest('checkout/sessions', params);
  return session.url;
}

export async function createPortalSession({ frontendBaseUrl }) {
  if (!isConfigured()) throw new Error('Billing is not configured on this server.');
  const sub = await getSubscription();
  if (!sub.stripe_customer_id) throw new Error('No active subscription to manage yet.');

  const params = new URLSearchParams();
  params.append('customer', sub.stripe_customer_id);
  params.append('return_url', `${frontendBaseUrl}/#/settings`);

  const session = await stripeRequest('billing_portal/sessions', params);
  return session.url;
}

// Used by Harbor (Impact Digital's internal admin panel) to show this
// deployment's subscription status — one row, since Parcel bills the whole
// brokerage's deployment as a single subscription, not per end-user. Reads
// the live status/interval from Stripe instead of trusting the local cache,
// same reasoning as Rex's equivalent endpoint.
export async function getAdminSummary() {
  const sub = await getSubscription();
  if (!isConfigured() || !sub.stripe_subscription_id) {
    return { subscribers: [], billingEnabled: isConfigured() };
  }

  try {
    const [subscription, customer] = await Promise.all([
      stripeGet(`subscriptions/${sub.stripe_subscription_id}`),
      sub.stripe_customer_id ? stripeGet(`customers/${sub.stripe_customer_id}`) : Promise.resolve(null),
    ]);
    const price = subscription.items?.data?.[0]?.price;
    return {
      subscribers: [{
        email: customer?.email || null,
        plan: sub.plan,
        status: subscription.status,
        interval: price?.recurring?.interval || null,
        // What this subscriber is actually charged, in dollars — lets a
        // referring affiliate's commission be priced off the real Stripe
        // charge instead of staying permanently unknown (see Harbor's
        // affiliateEngine.js, which reads this field by this exact name).
        amount: typeof price?.unit_amount === 'number' ? price.unit_amount / 100 : null,
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
      }],
      billingEnabled: true,
    };
  } catch (err) {
    return {
      subscribers: [{ email: null, plan: sub.plan, status: 'unknown', interval: null, amount: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null }],
      billingEnabled: true,
    };
  }
}

export function planFromPriceId(priceId) {
  if (!priceId) return null;
  for (const table of [PRICE_ENV_BY_PLAN, YEARLY_PRICE_ENV_BY_PLAN]) {
    for (const [plan, envKey] of Object.entries(table)) {
      if (process.env[envKey] === priceId) return plan;
    }
  }
  return null;
}

// 'month' or 'year', from the price actually bought (yearly when it is one of the STRIPE_PRICE_*_ANUAL).
function intervalFromPriceId(priceId, fallback) {
  if (priceId) {
    for (const envKey of Object.values(YEARLY_PRICE_ENV_BY_PLAN)) if (process.env[envKey] === priceId) return 'year';
    for (const envKey of Object.values(PRICE_ENV_BY_PLAN)) if (process.env[envKey] === priceId) return 'month';
  }
  return fallback ? normalizeInterval(fallback) : null;
}

// Verifies Stripe's webhook signature by hand (HMAC-SHA256 over
// "<timestamp>.<raw body>"), the same scheme the `stripe` npm SDK's
// constructEvent() implements — done manually here since this app talks to
// Stripe's REST API directly instead of pulling in that SDK.
function verifyWebhookSignature(rawBody, signatureHeader, webhookSecret) {
  const parts = Object.fromEntries(
    String(signatureHeader || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2)
  );
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false; // evento antigo repetido

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${parts.t}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody}`, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parts.v1, 'hex'));
  } catch {
    return false;
  }
}

export async function handleWebhook(rawBody, signatureHeader) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set.');
  if (!verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
    throw new Error('Invalid webhook signature.');
  }

  const event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
  const obj = event.data?.object;

  if (!obj) return;

  if (event.type === 'checkout.session.completed') {
    // Evento de outro produto da mesma conta do Stripe: não é nosso.
    if (obj.metadata?.product && obj.metadata.product !== PRODUCT) return;
    const tagged = obj.metadata?.product === PRODUCT;
    // Um checkout criado por createCheckoutSession() leva metadata.plan e metadata.interval. Um feito por Payment Link (ou
    // sem etiqueta) não traz isso no webhook: busca o item de linha para saber qual preço foi comprado.
    let plan = tagged ? obj.metadata?.plan : null;
    let interval = tagged && obj.metadata?.interval ? normalizeInterval(obj.metadata.interval) : null;
    if (!tagged || !PLAN_RANK[plan] || !interval) {
      try {
        const lineItems = await stripeGet(`checkout/sessions/${obj.id}/line_items`);
        const priceId = lineItems.data?.[0]?.price?.id;
        if (!PLAN_RANK[plan]) plan = planFromPriceId(priceId);
        interval = interval || intervalFromPriceId(priceId, lineItems.data?.[0]?.price?.recurring?.interval);
      } catch (e) {
        // Com etiqueta, segue com o que tem (cai em 'basico' / mensal). Sem etiqueta não dá para saber de quem é: erro, o Stripe tenta de novo.
        if (!tagged) throw e;
      }
    }
    // Regra da casa: sem etiqueta do produto, só vale se o PREÇO comprado for um dos preços do Roster (metadata.plan sozinho não basta).
    if (!tagged && !PLAN_RANK[plan]) return;
    await run(`
      INSERT INTO subscription (id, plan, status, stripe_customer_id, stripe_subscription_id, billing_interval, updated_at)
      VALUES (1, ?, 'active', ?, ?, ?, now())
      ON CONFLICT (id) DO UPDATE SET
        plan = excluded.plan, status = excluded.status,
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        billing_interval = excluded.billing_interval,
        updated_at = now()
    `, PLAN_RANK[plan] ? plan : 'basico', obj.customer, obj.subscription, interval || 'month');
  } else if (event.type === 'customer.subscription.updated') {
    if (obj.metadata?.product && obj.metadata.product !== PRODUCT) return;
    const priceId = obj.items?.data?.[0]?.price?.id;
    const plan = obj.metadata?.plan || planFromPriceId(priceId);
    const interval = intervalFromPriceId(priceId, obj.items?.data?.[0]?.price?.recurring?.interval);
    await run(`
      UPDATE subscription SET
        plan = COALESCE(?, plan), status = ?, billing_interval = COALESCE(?, billing_interval), updated_at = now()
      WHERE stripe_subscription_id = ?
    `, PLAN_RANK[plan] ? plan : null, obj.status, interval, obj.id);
  } else if (event.type === 'customer.subscription.deleted') {
    await run(`
      UPDATE subscription SET status = 'canceled', updated_at = now()
      WHERE stripe_subscription_id = ?
    `, obj.id);
  }
}
