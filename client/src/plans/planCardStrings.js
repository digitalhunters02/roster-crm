// Textos que o cartão de planos e os botões com selo do Roster usam além dos do kit (planKit/planStrings.js). en / pt / es.
const S = {
  en: { thisIsCurrent: 'Current', perMonth: '/month', perYear: '/year', staffUpTo: 'Up to {n} staff logins', staffUnlimited: 'Unlimited staff logins', blocked: 'You are viewing Roster as another plan. Go back to your own plan to change billing, add logins, use AI or send messages.' },
  pt: { thisIsCurrent: 'Atual', perMonth: '/mês', perYear: '/ano', staffUpTo: 'Até {n} logins de equipe', staffUnlimited: 'Logins de equipe sem limite', blocked: 'Você está vendo o Roster como outro plano. Volte ao seu plano para mexer em assinatura, criar logins, usar IA ou enviar mensagens.' },
  es: { thisIsCurrent: 'Actual', perMonth: '/mes', perYear: '/año', staffUpTo: 'Hasta {n} accesos de equipo', staffUnlimited: 'Accesos de equipo sin límite', blocked: 'Está viendo Roster como otro plan. Vuelva a su plan para cambiar la suscripción, crear accesos, usar IA o enviar mensajes.' },
};
export const planCardStr = (lang) => S[lang] || S.en;
