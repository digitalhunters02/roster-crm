# Roster - ready for the app stores (not published)

Nothing here is published. When the owner decides to publish, follow the steps at the end.

| Field | Value |
|---|---|
| Name | Roster |
| Suggested package ID | `com.impactdigital.roster` |
| Category | Business |
| Privacy policy | `https://<site>/#/privacy` |
| Terms | `https://<site>/#/terms` |
| Support | the Impact Digital support email |

## Short description (80 characters)
- en: Staffing CRM: clients, jobs, candidates, placements and timesheets.
- pt: CRM de staffing: clientes, vagas, candidatos, colocacoes e folhas de horas.

## Long description
- en: Roster is the CRM for staffing and recruiting agencies. Keep clients, jobs and candidates in one place, move people through your pipeline, record placements with pay rate, bill rate and fee, track timesheets and invoices, talk to candidates on WhatsApp, and let automations alert you when a candidate is submitted, a job stays open too long or a timesheet is late. Import candidates and clients from a photo or paste a resume to fill the form. English, Portuguese and Spanish.
- pt: O Roster e o CRM para agencias de staffing e recrutamento. Clientes, vagas e candidatos no mesmo lugar, funil de selecao, colocacoes com valor pago, valor cobrado e taxa, folhas de horas e faturas, conversa com candidatos no WhatsApp e automacoes que avisam quando um candidato e enviado, uma vaga fica aberta demais ou uma folha de horas atrasa. Importe candidatos e clientes de uma foto ou cole um curriculo para preencher o formulario. Ingles, portugues e espanhol.

## Screenshots to capture
- Phone 1080x1920: Dashboard, Pipeline, Candidates (with the resume paste open), Timesheets, Automations, Settings > Plan & billing.
- Tablet 1600x2560: Dashboard and Pipeline.

## Packaging (Capacitor) - only when the owner asks
```
npm i @capacitor/core @capacitor/cli
npx cap init Roster com.impactdigital.roster --web-dir client/dist   # capacitor.config.json already exists
npm run build
npx cap add android   # and/or: npx cap add ios
npx cap sync
```
Do not install the native platforms or publish before the owner asks.
