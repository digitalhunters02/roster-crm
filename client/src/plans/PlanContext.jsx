import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

// Páginas travadas pelo plano respondem 402; chamadas de fundo (ex.: Configurações pedindo o WhatsApp) não devem
// virar erro vermelho no console: o convite de upgrade já aparece na tela.
if (typeof window !== 'undefined' && !window.__planRejectionGuard) {
  window.__planRejectionGuard = true;
  window.addEventListener('unhandledrejection', (e) => { if (e.reason && e.reason.status === 402) e.preventDefault(); });
}

// Plano em vigor desta instalação (vem de /api/billing/status): o menu mostra cadeado nos recursos
// que o plano não libera e as páginas travadas mostram o convite para fazer upgrade.
const PlanCtx = createContext({ billing: null, allows: () => true, refresh: () => {} });

export function PlanProvider({ children }) {
  const { token } = useAuth();
  const [billing, setBilling] = useState(null);
  const refresh = useCallback(() => {
    if (!token) { setBilling(null); return Promise.resolve(); }
    return api.billingStatus().then(setBilling).catch(() => {});
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);
  // Sem a resposta ainda (ou servidor antigo), nada fica travado na tela: o servidor é quem manda.
  const allows = useCallback((feature) => !billing || !billing.features || billing.features[feature] !== false, [billing]);
  return <PlanCtx.Provider value={{ billing, allows, refresh }}>{children}</PlanCtx.Provider>;
}

export const usePlan = () => useContext(PlanCtx);
