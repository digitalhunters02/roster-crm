import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../auth/i18n.js';
import { PlanProvider as KitProvider } from '../planKit/PlanUpsellModal.jsx';
import '../planKit/planPreview.js'; // manda X-Preview-Plan em todo pedido ao servidor (só vale para o dono da plataforma)

// Páginas travadas pelo plano respondem 402; chamadas de fundo (ex.: Configurações pedindo o WhatsApp) não devem
// virar erro vermelho no console: o selo de plano já aparece na tela.
if (typeof window !== 'undefined' && !window.__planRejectionGuard) {
  window.__planRejectionGuard = true;
  window.addEventListener('unhandledrejection', (e) => { if (e.reason && e.reason.status === 402) e.preventDefault(); });
}

// Nomes dos planos nos 3 idiomas (a chave interna é a do portfólio; o nome em inglês vem do servidor).
const PLAN_NAMES = {
  en: null, // usa o nome do catálogo do servidor
  pt: { basico: 'Essencial', essencial: 'Profissional', completo: 'Completo' },
  es: { basico: 'Esencial', essencial: 'Profesional', completo: 'Completo' },
};

// Plano em vigor desta instalação (vem de /api/billing/status): o menu e os botões mostram o SELO do plano mínimo nos recursos
// que o plano atual não libera (e abrem a janelinha "Disponível no plano X"); o servidor é quem manda.
const PlanCtx = createContext({ billing: null, allows: () => true, refresh: () => {} });

export function PlanProvider({ children }) {
  const { token, account } = useAuth();
  const { lang } = useT();
  const navigate = useNavigate();
  const [billing, setBilling] = useState(null);
  const refresh = useCallback(() => {
    if (!token) { setBilling(null); return Promise.resolve(); }
    return api.billingStatus().then(setBilling).catch(() => {});
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);
  // Sem a resposta ainda (ou servidor antigo), nada fica travado na tela: o servidor é quem manda.
  const allows = useCallback((feature) => !billing || !billing.features || billing.features[feature] !== false, [billing]);
  const names = useMemo(() => {
    const own = PLAN_NAMES[lang];
    if (own) return own;
    return Object.fromEntries((billing?.catalog || []).map((p) => [p.key, p.name]));
  }, [lang, billing]);
  const theme = useMemo(() => ({ accent: '#5B4EE0', card: '#FFFFFF', light: true }), []);
  return (
    <PlanCtx.Provider value={{ billing, allows, refresh, names }}>
      <KitProvider
        catalog={billing?.catalog || []} gates={billing?.gates || {}} names={names} enabled={!!billing}
        langKey={lang} theme={theme} canUpgrade={account?.role === 'owner'}
        onGoPlans={() => navigate('/settings?section=billing')}
      >
        {children}
      </KitProvider>
    </PlanCtx.Provider>
  );
}

export const usePlan = () => useContext(PlanCtx);
