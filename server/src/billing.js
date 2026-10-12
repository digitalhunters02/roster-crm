// Subscription billing — Impact Digital's own Stripe account (not a per-agency "connect your own",
// unlike WhatsApp), since this bills the agency for the Roster subscription itself.
// One subscription per deployment (singleton row, id=1), same pattern as Parcel/whatsapp_connection. Calls Stripe's REST API directly via fetch, same
// approach as Binder's stripeBilling.js — no `stripe` npm SDK.
import crypto from 'node:crypto';
import { get, run } from './db.js';

// Plan keys stay Portuguese identifiers (basico/essencial/completo) since
// they're already stored in the database and in Stripe metadata — only the
// English label shown in API error messages changes here. The frontend
// shows its own translated label for whichever language is selected.
export const PLAN_RANK = { basico: 1, essencial: 2, completo: 3 };
export const PLAN_LABELS = { basico: 'Basic', essencial: 'Essential', completo: 'Complete' };

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
// List price, US$ per month (the Settings screen shows the same numbers).
export const PLAN_PRICES = { basico: 79, essencial: 149, completo: 269 };
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

// Limits per plan (Roster proposal, 12/10/2026): staff logins, candidates, open jobs and active automations.
// "Infinity" = no limit. Customer-side people (clients approving hours) never count as users.
export const PLAN_USER_LIMITS = { basico: 3, essencial: 8, completo: 25 };
export const PLAN_LIMITS = {
  basico: { users: 3, candidates: 1000, openJobs: 25, automations: 2 },
  essencial: { users: 8, candidates: Infinity, openJobs: Infinity, automations: Infinity },
  completo: { users: 25, candidates: Infinity, openJobs: Infinity, automations: Infinity },
};
// Lowest plan that unlocks each locked area (the Basic plan has no payroll-side tools or WhatsApp).
export const FEATURE_MIN_PLAN = { timesheets: 'essencial', whatsapp: 'essencial', portal: 'essencial', messaging: 'essencial', ai: 'completo' };
export const featuresFor = (plan) => Object.fromEntries(Object.entries(FEATURE_MIN_PLAN).map(([f, min]) => [f, PLAN_RANK[plan] >= PLAN_RANK[min]]));

// The plan Impact Digital's provisioning robot sets (LICENSED_PLAN) on a
// customer install, or null on any other deployment.
export function licensedPlan() {
  const p = process.env.LICENSED_PLAN;
  return p && PLAN_RANK[p] ? p : null;
}

// The plan actually enforced. Limits only apply to a deployment that is paying
// through Stripe: when billing isn't configured, or the subscription row has
// no Stripe subscription behind it (Impact Digital's own instance, the demo,
// a manually provisioned install), everything stays unlocked so a deployment
// never locks itself out.
export async function effectivePlan() {
  // Set by Impact Digital's provisioning robot on customer installs it
  // creates: the plan that customer bought, which always wins over whatever
  // this install's own subscription row says.
  const licensed = licensedPlan();
  if (licensed) return licensed;
  if (!isConfigured()) return 'completo';
  const sub = await getSubscription();
  if (!sub.stripe_subscription_id) return 'completo';
  // A canceled subscription falls back to the Basic limits (nothing is deleted; only adding more is blocked).
  if (sub.status === 'canceled') return 'basico';
  return PLAN_RANK[sub.plan] ? sub.plan : 'basico';
}

// Gates a route to accounts on at least `minPlan`.
export function requirePlan(minPlan) {
  return async (req, res, next) => {
    try {
      const current = await effectivePlan();
      if (PLAN_RANK[current] < PLAN_RANK[minPlan]) {
        return res.status(402).json({
          error: `This feature requires the ${PLAN_LABELS[minPlan]} plan or higher.`,
          code: 'plan_required',
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

export async function createCheckoutSession(plan, { backendBaseUrl, frontendBaseUrl, interval = 'month' }) {
  if (!isConfigured()) throw new Error('Billing is not configured on this server.');
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
    (signatureHeader || '').split(',').map((p) => p.split('='))
  );
  if (!parts.t || !parts.v1) return false;

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${parts.t}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody}`, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
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

  if (event.type === 'checkout.session.completed') {
    // evento de outro produto da mesma conta do Stripe: não é nosso
    if (obj.metadata?.product && obj.metadata.product !== PRODUCT) return;
    // A checkout started from our own createCheckoutSession() carries
    // metadata.plan directly. One started from a Stripe Payment Link
    // (pasted straight into the "Subscribe" button, no backend call) has
    // neither metadata nor expanded line items in the webhook payload
    // itself — fetch the session's line item to find the price actually
    // purchased.
    let plan = obj.metadata?.plan;
    let interval = obj.metadata?.interval ? normalizeInterval(obj.metadata.interval) : null;
    if (!plan || !interval) {
      try {
        const lineItems = await stripeGet(`checkout/sessions/${obj.id}/line_items`);
        const priceId = lineItems.data?.[0]?.price?.id;
        plan = plan || planFromPriceId(priceId);
        interval = interval || intervalFromPriceId(priceId, lineItems.data?.[0]?.price?.recurring?.interval);
      } catch {
        // best-effort — falls through to the 'basico' default below rather
        // than losing the whole webhook over a lookup failure
      }
    }
    if (!obj.metadata?.product && !plan) return; // sem etiqueta e com preço desconhecido: não é deste produto
    await run(`
      INSERT INTO subscription (id, plan, status, stripe_customer_id, stripe_subscription_id, billing_interval, updated_at)
      VALUES (1, ?, 'active', ?, ?, ?, now())
      ON CONFLICT (id) DO UPDATE SET
        plan = excluded.plan, status = excluded.status,
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        billing_interval = excluded.billing_interval,
        updated_at = now()
    `, plan || 'basico', obj.customer, obj.subscription, interval || 'month');
  } else if (event.type === 'customer.subscription.updated') {
    if (obj.metadata?.product && obj.metadata.product !== PRODUCT) return;
    const priceId = obj.items?.data?.[0]?.price?.id;
    const plan = obj.metadata?.plan || planFromPriceId(priceId);
    const interval = intervalFromPriceId(priceId, obj.items?.data?.[0]?.price?.recurring?.interval);
    await run(`
      UPDATE subscription SET
        plan = COALESCE(?, plan), status = ?, billing_interval = COALESCE(?, billing_interval), updated_at = now()
      WHERE stripe_subscription_id = ?
    `, plan, obj.status, interval, obj.id);
  } else if (event.type === 'customer.subscription.deleted') {
    await run(`
      UPDATE subscription SET status = 'canceled', updated_at = now()
      WHERE stripe_subscription_id = ?
    `, obj.id);
  }
}
