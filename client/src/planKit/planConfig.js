// client/src/planKit/planConfig.js
// ARQUIVO DE AJUSTE (o único dos arquivos do "selo de plano" que é específico do produto): aqui ficam as ligações com este app.
// Os demais (PlanBadge, PlanUpsellModal, PlanPreview, planPreview, planStrings) são os do kit, iguais em todos os CRMs
// (no Roster/Harbor mudam só o ícone local e os nomes de plano traduzidos, marcados com "Harbor:" nos comentários).
// Os planos, preços, o plano mínimo de cada recurso e o que cada plano acrescenta vêm do SERVIDOR (/api/billing/status,
// /api/public/plans; a fonte é FEATURE_MIN_PLAN em server/src/planConfig.js). Aqui só ficam: textos dos recursos, quais itens de menu têm selo e três ajustes.

export { BASE as API_URL } from '../api.js'; // o endereço do servidor deste app (…/api)

export const APP_NAME = 'Roster'; // nome do produto (aparece na faixa "Você está vendo o … como o plano …")
export const PREVIEW_STORAGE_KEY = 'roster_preview_plan'; // chave do localStorage (única por produto)
export const CURRENCY = 'USD'; // moeda dos preços do catálogo (código ISO)

// Itens de menu (rota sem a barra) -> recurso do servidor (chave de FEATURE_MIN_PLAN). Para pôr selo em outro item: UMA linha aqui.
export const NAV_GATES = {
  placements: 'placements',
  timesheets: 'timesheets',
  whatsapp: 'whatsapp',
  automations: 'automations',
  reports: 'reports',
};

// Texto de cada recurso com selo: nome curto + 1–2 frases do que faz. Ordem dos idiomas: [en, pt, es].
// Acrescente a chave igual à do servidor para um recurso novo.
export const GATE_TEXT = {
  placements: {
    name: ['Placements', 'Colocações', 'Colocaciones'],
    what: ['Track every candidate you placed: client, start date, pay and bill rate, all in one place.', 'Acompanhe cada candidato que você colocou: cliente, data de início, pagamento e valor cobrado, tudo num só lugar.', 'Siga a cada candidato que colocó: cliente, fecha de inicio, pago y tarifa cobrada, todo en un solo lugar.'],
  },
  timesheets: {
    name: ['Timesheets and invoicing', 'Horas e faturamento', 'Horas y facturación'],
    what: ['Record the hours your staff worked and bill your clients without a spreadsheet.', 'Registre as horas trabalhadas pela sua equipe e cobre os clientes sem planilha.', 'Registre las horas trabajadas por su equipo y facture a sus clientes sin hojas de cálculo.'],
  },
  reports: {
    name: ['Reports', 'Relatórios', 'Informes'],
    what: ['See placements, revenue and your pipeline by recruiter, client and period.', 'Veja colocações, receita e funil por recrutador, cliente e período.', 'Vea colocaciones, ingresos y embudo por reclutador, cliente y período.'],
  },
  careers: {
    name: ['Careers page', 'Página de vagas', 'Página de empleos'],
    what: ['A public page with your open jobs. Applicants land in the pipeline by themselves.', 'Uma página pública com as suas vagas abertas. Quem se candidata cai sozinho no funil.', 'Una página pública con sus vacantes abiertas. Los postulantes llegan solos al embudo.'],
  },
  resume_ai: {
    name: ['Fill from a resume (AI)', 'Preencher a partir do currículo (IA)', 'Completar desde el currículum (IA)'],
    what: ['Paste a resume and the candidate form is filled in for you to review.', 'Cole um currículo e a ficha do candidato é preenchida para você conferir.', 'Pegue un currículum y la ficha del candidato se completa para que la revise.'],
  },
  margin: {
    name: ['Margin per client', 'Margem por cliente', 'Margen por cliente'],
    what: ['See what you earn on every hour worked, by client, and download it.', 'Veja quanto você ganha em cada hora trabalhada, por cliente, e baixe o resultado.', 'Vea cuánto gana en cada hora trabajada, por cliente, y descárguelo.'],
  },
  hours_export: {
    name: ['Hours and margin export (CSV)', 'Exportar horas e margem (CSV)', 'Exportar horas y margen (CSV)'],
    what: ['Download hours, pay and margin as a file for your accountant.', 'Baixe horas, pagamento e margem num arquivo para o seu contador.', 'Descargue horas, pago y margen en un archivo para su contador.'],
  },
  hours_portal: {
    name: ['Client approval link', 'Link de aprovação do cliente', 'Enlace de aprobación del cliente'],
    what: ['Send your client a link to approve or reject the hours online.', 'Envie ao cliente um link para aprovar ou recusar as horas pela internet.', 'Envíe a su cliente un enlace para aprobar o rechazar las horas en línea.'],
  },
  automations: {
    name: ['Automations', 'Automações', 'Automatizaciones'],
    what: ['Let Roster do the repetitive follow-ups for you, like moving candidates and reminding the team.', 'Deixe o Roster fazer os acompanhamentos repetitivos por você, como mover candidatos e avisar a equipe.', 'Deje que Roster haga los seguimientos repetitivos por usted, como mover candidatos y avisar al equipo.'],
  },
  whatsapp: {
    name: ['WhatsApp inbox', 'Caixa de entrada do WhatsApp', 'Bandeja de WhatsApp'],
    what: ['Talk to candidates and clients on WhatsApp without leaving Roster.', 'Converse com candidatos e clientes no WhatsApp sem sair do Roster.', 'Hable con candidatos y clientes por WhatsApp sin salir de Roster.'],
  },
  // Vagas de login de equipe (os limites 3 / 10 / sem limite vêm do servidor; o número aparece no cartão de cada plano)
  staff_essencial: {
    name: ['More staff logins', 'Mais logins de equipe', 'Más accesos de equipo'],
    what: ['Give more people on your team their own Roster login, each with their own password.', 'Dê a mais pessoas da sua equipe um login próprio no Roster, cada uma com a sua senha.', 'Dé a más personas de su equipo un acceso propio a Roster, cada una con su contraseña.'],
  },
  staff_completo: {
    name: ['Even more staff logins', 'Ainda mais logins de equipe', 'Todavía más accesos de equipo'],
    what: ['For larger teams: the highest staff login limit, with no extra cost per person.', 'Para equipes maiores: o maior limite de logins de equipe, sem custo extra por pessoa.', 'Para equipos grandes: el mayor límite de accesos de equipo, sin costo extra por persona.'],
  },
};
