// Rotas de plano e cobrança. O webhook do Stripe é público (vai antes do login) e usa o corpo cru guardado em req.rawBody.
import * as billing from './billing.js';
import { isOwnerEmail } from './owner.js';
import { blockInPreview } from './previewPlan.js';

const frontendBaseUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/+$/, '');

export function mountBillingWebhook(app, ar) {
  app.post('/api/billing/webhook', ar(async (req, res) => {
    try {
      await billing.handleWebhook(req.rawBody, req.headers['stripe-signature']);
      res.sendStatus(200);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }));
}

// Planos à venda (preço, o que cada plano acrescenta e o plano mínimo de cada recurso), sem login: mesma fonte do app logado.
export function mountPublicPlans(app, ar) {
  app.get('/api/public/plans', ar(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ catalog: billing.publicCatalog(), gates: billing.publicGates() });
  }));
}

// Depois do login: status do plano para qualquer conta; escolher plano e gerenciar assinatura só o dono.
export function mountBilling(app, ar, requireOwner) {
  // `owner` = a conta é de dono da plataforma (OWNER_EMAILS): o front mostra o "Ver como plano". `previewPlan` = o plano que ele está vendo.
  app.get('/api/billing/status', ar(async (req, res) => res.json({ ...(await billing.status()), owner: isOwnerEmail(req.account?.email) })));
  app.post('/api/billing/checkout', requireOwner, blockInPreview, ar(async (req, res) => {
    try {
      res.json({ url: await billing.createCheckoutSession(String(req.body?.plan || ''), { frontendBaseUrl: frontendBaseUrl(), interval: req.body?.interval }) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  }));
  app.post('/api/billing/portal', requireOwner, blockInPreview, ar(async (_req, res) => {
    try { res.json({ url: await billing.createPortalSession({ frontendBaseUrl: frontendBaseUrl() }) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  }));
}
