// "Ver como plano" do dono: lê o cabeçalho X-Preview-Plan SÓ para contas de dono (e-mail em OWNER_EMAILS); para qualquer
// outra conta o cabeçalho é ignorado. Também traz `blockInPreview`, que recusa (409) ações que gastam, cobram ou mexem em
// plano/assinatura/contas enquanto o dono olha como outro plano.
// Ligação (index.js):  app.use('/api', requireAuth, applyPreview);  e nas rotas de cobrança:  app.post('/x', blockInPreview, ...)
import { store, isOwnerEmail } from './owner.js';
import { PLAN_RANK } from './planConfig.js';

export function applyPreview(req, _res, next) {
  const want = String(req.headers['x-preview-plan'] || '').trim().toLowerCase();
  if (want && PLAN_RANK[want] && req.account && isOwnerEmail(req.account.email)) {
    req.previewPlan = want;
    return store.run({ plan: want }, next);
  }
  return next();
}

export function blockInPreview(req, res, next) {
  if (req.previewPlan) {
    return res.status(409).json({
      error: 'You are viewing Roster as another plan. Go back to your own plan to change billing, add logins, read resumes with AI or use WhatsApp.',
      code: 'preview_readonly',
    });
  }
  return next();
}
