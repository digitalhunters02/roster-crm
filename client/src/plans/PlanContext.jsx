import { createContext, useContext, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../auth/i18n.js';
import { useBilling, refreshBilling, clearBilling, PLAN_NAMES } from '../billing/useBilling.js';
import { PlanProvider as KitProvider } from '../planKit/PlanUpsellModal.jsx';
import '../planKit/planPreview.js'; // manda X-Preview-Plan em todo pedido ao servidor (só vale para o dono da plataforma)

// Páginas travadas pelo plano respondem 402; chamadas de fundo não devem virar erro vermelho no console:
// o selo de plano já aparece na tela.
if (typeof window !== 'undefined' && !window.__planRejectionGuard) {
  window.__planRejectionGuard = true;
  window.addEventListener('unhandledrejection', (e) => { if (e.reason && e.reason.status === 402) e.preventDefault(); });
}

// Plano em vigor desta instalação (vem de /api/billing/status, o mesmo pedido que o cartão de planos e as telas usam): o menu e os
// botões mostram o SELO do plano mínimo nos recursos que o plano atual não libera (e abrem a janelinha "Disponível no plano X").
// O servidor é quem manda: sem a resposta ainda (ou servidor antigo), nada fica travado na tela.
const PlanCtx = createContext({ billing: null, allows: () => true, refresh: () => {}, names: {} });

export function PlanProvider({ children }) {
  const { account, token } = useAuth();
  const { t, lang } = useT();
  const navigate = useNavigate();
  const { billing, refresh } = useBilling();
  // Each login asks once; signing out forgets the answer so the next login never sees the previous plan.
  useEffect(() => { if (token) refreshBilling(); else clearBilling(); }, [token]);
  const allows = (feature) => !billing || !billing.features || billing.features[feature] !== false;
  // Nomes dos planos no idioma da tela (a chave interna é a do portfólio; o nome em inglês é o do cartão de planos).
  const names = useMemo(() => Object.fromEntries(Object.entries(PLAN_NAMES).map(([k, v]) => [k, t(v)])), [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const theme = useMemo(() => ({ accent: '#5B4EE0', card: '#FFFFFF', light: true }), []);
  return (
    <PlanCtx.Provider value={{ billing, allows, refresh, names }}>
      <KitProvider
        catalog={billing?.catalog || []} gates={billing?.gates || {}} names={names} enabled={!!billing}
        langKey={lang} theme={theme} canUpgrade={account?.role === 'owner'}
        onGoPlans={() => navigate('/settings?plan=1')}
      >
        {children}
      </KitProvider>
    </PlanCtx.Provider>
  );
}

export const usePlan = () => useContext(PlanCtx);
