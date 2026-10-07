// Planos de Roster: preços, limites e o que cada plano libera. Chaves de plano seguem o portfólio
// (basico / essencial / completo); os nomes na tela são os de PLAN_LABELS.
export const PRODUCT = { key: 'roster', name: 'Roster' };
export const PLAN_RANK = { basico: 1, essencial: 2, completo: 3 };
export const PLAN_LABELS = { basico: 'Essential', essencial: 'Professional', completo: 'Complete' };
// US$ por mês (o anual é 10% abaixo de 12 mensalidades).
export const PLAN_PRICES = { basico: 49, essencial: 119, completo: 249 };
// Logins de equipe por plano. "Completo ilimitado" ainda será discutido: PLAN_COMPLETO_USER_LIMIT põe um teto.
const cap = Number(process.env.PLAN_COMPLETO_USER_LIMIT);
export const PLAN_USER_LIMITS = { basico: 3, essencial: 10, completo: cap > 0 ? cap : Infinity };
// Limites extras por tipo de registro (ex.: alunos).
export const PLAN_EXTRA_LIMITS = {};
// Recurso → menor plano que o libera (tudo que não está aqui vale para todos os planos).
export const FEATURE_MIN_PLAN = {
  placements: 'essencial',
  timesheets: 'essencial',
  reports: 'essencial',
  careers: 'essencial',
  resume_ai: 'essencial',
  margin: 'completo',
  hours_export: 'completo',
  hours_portal: 'completo',
  automations: 'completo',
  whatsapp: 'completo',
};
// Rotas da API protegidas por plano: [prefixo, recurso]. Valem só depois do login.
export const API_GATES = [
  ['/api/placements', 'placements'],
  ['/api/candidates/parse-resume', 'resume_ai'],
  ['/api/timesheets/margin', 'margin'],
  ['/api/timesheets/export', 'hours_export'],
  ['/api/timesheets', 'timesheets'],
  ['/api/reports', 'reports'],
  ['/api/automations', 'automations'],
  ['/api/integrations/whatsapp', 'whatsapp'],
];
