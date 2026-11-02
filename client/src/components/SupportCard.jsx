import { useState } from 'react';
import { SUPPORT_EMAIL, supportHref, supportText, useSupportLang } from '../support.js';

// "Ajuda e suporte" em Configurações (todo mundo vê).
export default function SupportCard() {
  const lang = useSupportLang();
  const [copied, setCopied] = useState(false);
  const tx = (k) => supportText(k, lang);
  async function copy() {
    try { await navigator.clipboard.writeText(SUPPORT_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem permissão: o endereço continua na tela */ }
  }
  return (
    <div data-testid="support-card" className="bg-surface border border-line rounded-xl mb-4">
      <div className="px-5 pt-4 pb-3 border-b border-lineSoft">
        <h3 className="font-serif text-[15px] font-semibold text-ink">{tx('title')}</h3>
        <p className="text-xs text-muted mt-0.5">{tx('intro')}</p>
      </div>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <b data-testid="support-email" className="text-sm text-ink select-all break-all">{SUPPORT_EMAIL}</b>
          <a href={supportHref()} data-testid="support-write" className="inline-flex items-center rounded-lg bg-brand text-white font-semibold text-sm px-3.5 py-2 hover:opacity-90">{tx('write')}</a>
          <button type="button" onClick={copy} data-testid="support-copy" className="inline-flex items-center rounded-lg border border-line bg-white text-ink text-sm px-3.5 py-2 hover:bg-wash">{copied ? tx('copied') : tx('copy')}</button>
        </div>
        <p className="text-xs text-muted">{tx('tip')}</p>
      </div>
    </div>
  );
}

// Item do menu lateral: abre o e-mail do suporte. Componente próprio para o gancho de idioma ficar sempre na mesma ordem.
export function SupportNavLink() {
  const lang = useSupportLang();
  return (
    <a href={supportHref()} data-testid="nav-support" className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-sideMuted hover:text-white border-t border-sideLine transition-colors">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" /></svg>
      <span className="truncate">{supportText('menu', lang)}</span>
    </a>
  );
}
