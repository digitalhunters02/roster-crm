// "Write with AI" button for a form field. The result goes into the field for the person to read and edit; nothing is saved until they save the form.
import { useState } from 'react';
import { Button } from './ui.jsx';
import { useT } from '../auth/i18n.js';
import PlanBadge, { usePlanGate } from '../planKit/PlanBadge.jsx';

export default function AiWriteButton({ label, run, onText, disabled, testId }) {
  const { t } = useT();
  const gate = usePlanGate('ai'); // Complete plan: below that the button stays, with the plan seal, and opens the "Available on the X plan" window
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function go() {
    setBusy(true); setMsg('');
    try { const r = await run(); onText(r.text); setMsg(t('Written by AI. Read it and fix anything before saving. ({used} of {limit} used this month)', { used: r.used, limit: r.limit })); }
    catch (e) { setMsg(e.status === 503 ? t('The AI is not turned on on this server yet. Ask your administrator.') : e.status === 402 ? t('The monthly AI limit for this installation was reached. It renews next month.') : e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="mb-2">
      <Button size="sm" variant="outline" onClick={gate.locked ? gate.open : go} disabled={!gate.locked && (busy || disabled)} data-testid={testId} data-plan-locked={gate.locked ? gate.minPlan : undefined}>{busy ? t('Writing…') : label}{gate.locked && <PlanBadge gate="ai" inherit />}</Button>
      {msg && <p className="text-xs text-muted mt-1.5" data-testid="ai-msg">{msg}</p>}
    </div>
  );
}
