// Rotas de plano e cobrança. O webhook do Stripe é público (vai antes do login) e usa o corpo cru guardado em req.rawBody.
import * as billing from './billing.js';

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

// Depois do login: status do plano para qualquer conta; escolher plano e gerenciar assinatura só o dono.
export function mountBilling(app, ar, requireOwner) {
  app.get('/api/billing/status', ar(async (_req, res) => res.json(await billing.status())));
  app.post('/api/billing/checkout', requireOwner, ar(async (req, res) => {
    try {
      res.json({ url: await billing.createCheckoutSession(String(req.body?.plan || ''), { frontendBaseUrl: frontendBaseUrl(), interval: req.body?.interval }) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  }));
  app.post('/api/billing/portal', requireOwner, ar(async (_req, res) => {
    try { res.json({ url: await billing.createPortalSession({ frontendBaseUrl: frontendBaseUrl() }) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  }));
}
