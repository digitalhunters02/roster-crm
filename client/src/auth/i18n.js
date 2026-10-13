import { useSyncExternalStore } from 'react';
import { AUTH_STRINGS } from './strings.js';
import { BRAND } from './brand.jsx';

export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
];

function initialLang() {
  try {
    const saved = localStorage.getItem(BRAND.langKey);
    if (saved && AUTH_STRINGS[saved]) return saved;
  } catch { /* storage blocked */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language || 'en').slice(0, 2).toLowerCase();
  return AUTH_STRINGS[nav] ? nav : 'en';
}

let current = initialLang();
if (typeof document !== 'undefined') document.documentElement.lang = current;
const listeners = new Set();

export function setLang(code) {
  if (!AUTH_STRINGS[code]) return;
  current = code;
  try { localStorage.setItem(BRAND.langKey, code); } catch { /* storage blocked */ }
  document.documentElement.lang = code;
  listeners.forEach((l) => l());
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function translate(lang, key, vars) {
  if (lang !== 'en' && typeof window !== 'undefined' && window.__COLLECT_I18N__ && AUTH_STRINGS[lang]?.[key] === undefined) {
    (window.__i18nMissing = window.__i18nMissing || new Set()).add(key);
  }
  let s = AUTH_STRINGS[lang]?.[key] ?? AUTH_STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export function useT() {
  const lang = useSyncExternalStore(subscribe, () => current, () => 'en');
  // tq: "quiet" lookup for text that may or may not be a translation key (database values, text already translated):
  // translates when it can, otherwise returns the text unchanged and records nothing.
  const tq = (key) => (key && AUTH_STRINGS[lang]?.[key]) || key;
  return { lang, setLang, t: (key, vars) => translate(lang, key, vars), tq };
}

// Turns an API/network error into a friendly, translated sentence.
export function friendlyError(err, t) {
  if (err?.code && AUTH_STRINGS.en[`err.${err.code}`]) return t(`err.${err.code}`);
  return t('err.generic');
}
