// Contato de suporte (decisão do Jadson: support@impactdigital.network em TODOS os produtos). Um só lugar para trocar.
import { useT } from './auth/i18n.js';
export const useSupportLang = () => useT().lang;

export const SUPPORT_EMAIL = 'support@impactdigital.network';
export const supportHref = (subject = 'Roster support') => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

const S = {
  title: { en: 'Help and support', pt: 'Ajuda e suporte', es: 'Ayuda y soporte' },
  intro: {
    en: 'Stuck, found a problem, or have a question? Write to us and a person will answer by e-mail.',
    pt: 'Travou, achou um problema ou tem uma dúvida? Escreva para nós e uma pessoa responde por e-mail.',
    es: '¿Se trabó, encontró un problema o tiene una duda? Escríbanos y una persona responde por correo.',
  },
  write: { en: 'Write to support', pt: 'Escrever ao suporte', es: 'Escribir a soporte' },
  copy: { en: 'Copy address', pt: 'Copiar endereço', es: 'Copiar dirección' },
  copied: { en: 'Copied.', pt: 'Copiado.', es: 'Copiado.' },
  tip: {
    en: 'Tip: say which page you were on and what you expected to happen, and write from the e-mail you use to sign in so we can find your account. Never send your password.',
    pt: 'Dica: diga em que tela estava e o que esperava que acontecesse, e escreva do mesmo e-mail que você usa para entrar, para acharmos a sua conta. Nunca mande a sua senha.',
    es: 'Consejo: diga en qué pantalla estaba y qué esperaba que pasara, y escriba desde el mismo correo con el que entra, para encontrar su cuenta. Nunca envíe su contraseña.',
  },
  menu: { en: 'Contact support', pt: 'Falar com o suporte', es: 'Hablar con soporte' },
  login: { en: 'Need help?', pt: 'Precisa de ajuda?', es: '¿Necesita ayuda?' },
};
export const supportText = (key, lang) => (S[key] && (S[key][lang] || S[key].en)) || '';
