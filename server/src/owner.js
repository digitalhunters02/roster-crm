// Dono da plataforma (variável OWNER_EMAILS, e-mails separados por vírgula) e o "ver como plano".
// O dono pode ver o Roster como qualquer plano à venda (cabeçalho X-Preview-Plan) SEM mudar a própria conta.
// `store` guarda, durante um pedido em modo prévia, { plan }; billing.js lê daqui o plano em vigor.
// Para qualquer conta que NÃO seja de dono o cabeçalho é ignorado (previewPlan.js).
import { AsyncLocalStorage } from 'node:async_hooks';

export const store = new AsyncLocalStorage(); // { plan } durante um pedido em modo "ver como plano"

export const ownerEmails = (env = process.env) => new Set(String(env.OWNER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
export const isOwnerEmail = (email, env = process.env) => ownerEmails(env).has(String(email || '').trim().toLowerCase());
