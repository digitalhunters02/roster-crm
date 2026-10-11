## Importar de foto (IA) e uso extra

Em **Clients** e **Candidates** há o botão "Importar de foto": tire uma foto ou cole um print (cartão de visita, conversa, formulário);
a IA preenche os campos e a pessoa **confere e edita antes de salvar** (nada é salvo sozinho e a imagem nunca é gravada). Limite por mês: Professional 100 · Complete 500 (o plano vem de LICENSED_PLAN; sem ele, instalação sem limite = Complete; Roster ainda não tem Stripe próprio);
conta nova ganha +100 nos primeiros 30 dias; teste de 3 dias: 3 leituras. Depois do limite o dono pode aprovar um teto mensal de leituras extras
(US$ 0,10 cada, na próxima fatura do Stripe). Usa `ANTHROPIC_API_KEY`. Rotas: `/api/photo-import`.
Testes: `server/test/photoImport.test.mjs` (Postgres) e `server/test/photo.e2e.mjs` (navegador).
