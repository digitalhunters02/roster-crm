// Calcula, a partir do catálogo de planos (billing.js), o "mapa recurso -> plano mínimo" que o front usa para desenhar o
// SELO DE PLANO ao lado de botões e itens que exigem um plano acima do atual. A fonte da verdade é o servidor: o front só consome.
// (Mesmo código do plan-kit do Rex, em módulo ES.)
//
// Acrescentar um recurso novo: uma linha em GATES (billing.js), por exemplo   relatorios: (p) => p.features.reports
// e (no front) um texto em client/src/planKit/planConfig.js. Nada mais.

export function makeGates(PLANS, GATES, fallbackKey) {
  const info = (key) => PLANS[key] || PLANS[fallbackKey];
  const sold = () => Object.values(PLANS).filter((p) => p.sold).sort((a, b) => a.rank - b.rank);
  const passes = (plan, gate) => !!GATES[gate](plan);

  // Menor plano à venda que libera o recurso (null se nenhum libera).
  function minPlanForGate(gate) {
    if (!GATES[gate]) return null;
    const p = sold().find((pl) => passes(pl, gate));
    return p ? p.key : null;
  }

  // { recurso: { minPlan, locked } } — `locked` = o plano informado NÃO libera o recurso (sem plano informado, só minPlan).
  function publicGates(planKey) {
    const plan = planKey ? info(planKey) : null;
    const out = {};
    for (const gate of Object.keys(GATES)) {
      out[gate] = { minPlan: minPlanForGate(gate) };
      if (plan) out[gate].locked = !passes(plan, gate);
    }
    return out;
  }

  // { plano: [recursos que ele ACRESCENTA em relação ao plano vendido anterior] } (o primeiro plano não acrescenta nada).
  function addsByPlan() {
    const list = sold();
    const out = {};
    list.forEach((plan, i) => {
      out[plan.key] = i === 0 ? [] : Object.keys(GATES).filter((g) => passes(plan, g) && !passes(list[i - 1], g));
    });
    return out;
  }

  return { minPlanForGate, publicGates, addsByPlan };
}
