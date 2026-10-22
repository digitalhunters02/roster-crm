// Planos do Roster: preços, limites e o que cada plano libera. É a FONTE ÚNICA: o servidor (barreiras 402), o
// /api/billing/status e o /api/public/plans (selo de plano no menu, nos botões e na janelinha "Disponível no plano X") leem tudo daqui.
// Chaves de plano seguem o portfólio (basico / essencial / completo) porque o robô de provisionamento do Harbor grava
// LICENSED_PLAN com esses nomes e elas já estão no banco e nos metadados do Stripe; os nomes na tela são os de PLAN_LABELS.
export const PLAN_RANK = { basico: 1, essencial: 2, completo: 3 };
export const PLAN_LABELS = { basico: 'Basic', essencial: 'Essential', completo: 'Complete' };
// US$ por mês (o anual é 12 mensalidades menos 10%).
export const PLAN_PRICES = { basico: 79, essencial: 149, completo: 269 };
// Logins de equipe por plano. Quem é do lado do cliente (aprova horas pelo link ou pelo portal) nunca conta.
export const PLAN_USER_LIMITS = { basico: 3, essencial: 8, completo: 25 };
// Limites por tipo de registro ("Infinity" = sem limite). Passar do limite devolve 402 só para ADICIONAR; nada é apagado.
export const PLAN_LIMITS = {
  basico: { users: 3, candidates: 1000, openJobs: 25, automations: 2 },
  essencial: { users: 8, candidates: Infinity, openJobs: Infinity, automations: Infinity },
  completo: { users: 25, candidates: Infinity, openJobs: Infinity, automations: Infinity },
};

// Recurso -> menor plano que o libera. Tudo que não está aqui vale para todos os planos.
// Para pôr selo em algo novo: UMA linha aqui + o texto em client/src/planKit/planConfig.js (GATE_TEXT).
export const FEATURE_MIN_PLAN = {
  // Essential
  timesheets: 'essencial',     // horas, margem e fatura imprimível
  margin: 'essencial',         // margem por cliente (resumo)
  hours_portal: 'essencial',   // link para o cliente aprovar ou recusar as horas
  portal: 'essencial',         // portal do cliente (candidatos, horas, faturas)
  messaging: 'essencial',      // e-mail/SMS com modelos, histórico por candidato
  whatsapp: 'essencial',       // caixa de entrada do WhatsApp
  careers: 'essencial',        // página pública de vagas
  resume_ai: 'essencial',      // leitura de currículo por IA (sem o plano, vale a leitura simples, que é de graça)
  connector: 'essencial',      // conector opcional com o Rex
  // Complete
  ai: 'completo',              // perfil do candidato e anúncio de vaga escritos pela IA
  suggestions: 'completo',     // candidatos sugeridos para uma vaga
  signatures: 'completo',      // assinatura eletrônica (Documenso da agência)
  documents: 'completo',       // documentos do candidato com vencimento
  payroll: 'completo',         // exportação de horas para a folha / contador (CSV)
  api: 'completo',             // chaves de API e webhooks
  offices: 'completo',         // vários escritórios
};

// Rotas da API protegidas por plano: [prefixo, recurso]; o mais específico vem primeiro. Valem só depois do login.
// As rotas de portal do cliente, assinatura, documentos, IA, escritórios, API e conector usam requirePlan('<recurso>') nos próprios módulos.
export const API_GATES = [
  ['/api/timesheets/margin', 'margin'],
  ['/api/timesheets/export', 'payroll'],
  ['/api/timesheets/payroll-export', 'payroll'],
  ['/api/timesheets', 'timesheets'],
  ['/api/integrations/whatsapp/connect', 'whatsapp'],
  ['/api/integrations/whatsapp/conversations', 'whatsapp'],
  ['/api/integrations/whatsapp/send', 'whatsapp'],
  ['/api/integrations/sms/connect', 'messaging'],
  ['/api/integrations/sms/disconnect', 'messaging'],
  ['/api/message-templates', 'messaging'],
];
