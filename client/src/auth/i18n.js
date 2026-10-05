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
  let s = AUTH_STRINGS[lang]?.[key] ?? AUTH_STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export function useT() {
  const lang = useSyncExternalStore(subscribe, () => current, () => 'en');
  return { lang, setLang, t: (key, vars) => translate(lang, key, vars) };
}

// Turns an API/network error into a friendly, translated sentence.
export function friendlyError(err, t) {
  if (err?.code && AUTH_STRINGS.en[`err.${err.code}`]) return t(`err.${err.code}`);
  return t('err.generic');
}
