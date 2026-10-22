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
  timesheets: 'timesheets',
  whatsapp: 'whatsapp',
};

// Texto de cada recurso com selo: nome curto + 1–2 frases do que faz. Ordem dos idiomas: [en, pt, es].
// Acrescente a chave igual à do servidor (server/src/planConfig.js, FEATURE_MIN_PLAN) para um recurso novo.
export const GATE_TEXT = {
  // ---- Essential ----
  timesheets: {
    name: ['Timesheets and invoicing', 'Horas e faturamento', 'Horas y facturación'],
    what: ['Record the hours your staff worked, see your margin and bill your clients without a spreadsheet.', 'Registre as horas trabalhadas pela sua equipe, veja a sua margem e cobre os clientes sem planilha.', 'Registre las horas trabajadas por su equipo, vea su margen y facture a sus clientes sin hojas de cálculo.'],
  },
  margin: {
    name: ['Margin per client', 'Margem por cliente', 'Margen por cliente'],
    what: ['See what you earn on every hour worked, client by client.', 'Veja quanto você ganha em cada hora trabalhada, cliente por cliente.', 'Vea cuánto gana en cada hora trabajada, cliente por cliente.'],
  },
  hours_portal: {
    name: ['Client approval link', 'Link de aprovação do cliente', 'Enlace de aprobación del cliente'],
    what: ['Send your client a link to approve or reject the hours online, with no login.', 'Envie ao cliente um link para aprovar ou recusar as horas pela internet, sem login.', 'Envíe a su cliente un enlace para aprobar o rechazar las horas en línea, sin iniciar sesión.'],
  },
  portal: {
    name: ['Client portal', 'Portal do cliente', 'Portal del cliente'],
    what: ['A private page where your client sees the candidates you sent, answers "interested" or "pass", approves hours and opens invoices.', 'Uma página privada onde o cliente vê os candidatos enviados, responde "interessado" ou "passar", aprova horas e abre as faturas.', 'Una página privada donde su cliente ve los candidatos enviados, responde "interesado" o "pasar", aprueba horas y abre las facturas.'],
  },
  messaging: {
    name: ['E-mail and SMS with templates', 'E-mail e SMS com modelos', 'Correo y SMS con plantillas'],
    what: ['Write to candidates by e-mail or text from Roster, with saved templates and the full history in one place.', 'Escreva aos candidatos por e-mail ou SMS direto do Roster, com modelos salvos e todo o histórico num só lugar.', 'Escriba a los candidatos por correo o SMS desde Roster, con plantillas guardadas y todo el historial en un solo lugar.'],
  },
  whatsapp: {
    name: ['WhatsApp inbox', 'Caixa de entrada do WhatsApp', 'Bandeja de WhatsApp'],
    what: ['Talk to candidates and clients on WhatsApp without leaving Roster.', 'Converse com candidatos e clientes no WhatsApp sem sair do Roster.', 'Hable con candidatos y clientes por WhatsApp sin salir de Roster.'],
  },
  careers: {
    name: ['Careers page', 'Página de vagas', 'Página de empleos'],
    what: ['A public page with your open jobs. Applicants land in the pipeline by themselves.', 'Uma página pública com as suas vagas abertas. Quem se candidata cai sozinho no funil.', 'Una página pública con sus vacantes abiertas. Los postulantes llegan solos al embudo.'],
  },
  resume_ai: {
    name: ['Resume reading by AI', 'Leitura de currículo por IA', 'Lectura de currículum con IA'],
    what: ['Paste a resume and the AI fills in the candidate form for you to review. Without it, the simple reading still works.', 'Cole um currículo e a IA preenche a ficha do candidato para você conferir. Sem ela, a leitura simples continua funcionando.', 'Pegue un currículum y la IA completa la ficha del candidato para que la revise. Sin ella, la lectura simple sigue funcionando.'],
  },
  connector: {
    name: ['Connect to Rex', 'Conexão com o Rex', 'Conexión con Rex'],
    what: ['Send your hour invoices to your Rex financial control as receivables, and mark them paid when the client pays.', 'Envie as faturas de horas para o seu controle financeiro no Rex como contas a receber e dê a baixa quando o cliente pagar.', 'Envíe sus facturas de horas a su control financiero en Rex como cuentas por cobrar y dé de baja cuando el cliente pague.'],
  },
  // ---- Complete ----
  ai: {
    name: ['AI writing', 'Textos com IA', 'Textos con IA'],
    what: ['The AI drafts the candidate profile and the job post from what you already typed. You read it before it is used.', 'A IA escreve o perfil do candidato e o anúncio da vaga com o que você já digitou. Você lê antes de usar.', 'La IA redacta el perfil del candidato y el anuncio de la vacante con lo que ya escribió. Usted lo lee antes de usarlo.'],
  },
  suggestions: {
    name: ['Suggested candidates', 'Candidatos sugeridos', 'Candidatos sugeridos'],
    what: ['For each open job, see which candidates in your database look like a fit.', 'Para cada vaga aberta, veja quais candidatos da sua base parecem combinar.', 'Para cada vacante abierta, vea qué candidatos de su base parecen encajar.'],
  },
  signatures: {
    name: ['E-signature', 'Assinatura eletrônica', 'Firma electrónica'],
    what: ['Send contracts and agreements to be signed online with your own Documenso account; the signed copy is kept in Roster.', 'Envie contratos e acordos para assinar pela internet com a sua conta do Documenso; a cópia assinada fica guardada no Roster.', 'Envíe contratos y acuerdos para firmar en línea con su cuenta de Documenso; la copia firmada queda guardada en Roster.'],
  },
  documents: {
    name: ['Documents with expiry dates', 'Documentos com vencimento', 'Documentos con vencimiento'],
    what: ['Keep a list of each candidate\'s documents and get a reminder before they expire.', 'Guarde a lista de documentos de cada candidato e receba um aviso antes de vencerem.', 'Guarde la lista de documentos de cada candidato y reciba un aviso antes de que venzan.'],
  },
  payroll: {
    name: ['Hours export for payroll (CSV)', 'Exportar horas para a folha (CSV)', 'Exportar horas para nómina (CSV)'],
    what: ['Download hours, pay and margin as a file for your payroll provider or accountant.', 'Baixe horas, pagamento e margem num arquivo para a sua folha de pagamento ou contador.', 'Descargue horas, pago y margen en un archivo para su nómina o contador.'],
  },
  api: {
    name: ['API keys and webhooks', 'Chaves de API e webhooks', 'Claves de API y webhooks'],
    what: ['Read your data and add candidates from other tools with an API key, and get a message at your address when something happens.', 'Leia os seus dados e inclua candidatos a partir de outras ferramentas com uma chave de API, e receba um aviso no seu endereço quando algo acontecer.', 'Lea sus datos y agregue candidatos desde otras herramientas con una clave de API, y reciba un aviso en su dirección cuando algo ocurra.'],
  },
  offices: {
    name: ['Several offices', 'Vários escritórios', 'Varias oficinas'],
    what: ['Label clients, jobs, candidates and recruiters by office and see results per office.', 'Marque clientes, vagas, candidatos e recrutadores por escritório e veja os resultados de cada um.', 'Etiquete clientes, vacantes, candidatos y reclutadores por oficina y vea los resultados de cada una.'],
  },
  // Vagas de login de equipe (os limites 3 / 8 / 25 vêm do servidor; o número aparece no cartão de cada plano)
  staff_essencial: {
    name: ['More staff logins', 'Mais logins de equipe', 'Más accesos de equipo'],
    what: ['Give more people on your team their own Roster login, each with their own password.', 'Dê a mais pessoas da sua equipe um login próprio no Roster, cada uma com a sua senha.', 'Dé a más personas de su equipo un acceso propio a Roster, cada una con su contraseña.'],
  },
  staff_completo: {
    name: ['Even more staff logins', 'Ainda mais logins de equipe', 'Todavía más accesos de equipo'],
    what: ['For larger teams: the highest staff login limit, with no extra cost per person.', 'Para equipes maiores: o maior limite de logins de equipe, sem custo extra por pessoa.', 'Para equipos grandes: el mayor límite de accesos de equipo, sin costo extra por persona.'],
  },
};
