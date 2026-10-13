// "Write with AI" button for a form field. The result goes into the field for the person to read and edit; nothing is saved until they save the form.
import { useState } from 'react';
import { Button } from './ui.jsx';
import { useT } from '../auth/i18n.js';
import { useBilling } from '../billing/useBilling.js';

export default function AiWriteButton({ label, run, onText, disabled, testId }) {
  const { t } = useT();
  const { billing } = useBilling();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!billing || billing.features?.ai !== true) return null; // Complete plan only
  async function go() {
    setBusy(true); setMsg('');
    try { const r = await run(); onText(r.text); setMsg(t('Written by AI. Read it and fix anything before saving. ({used} of {limit} used this month)', { used: r.used, limit: r.limit })); }
    catch (e) { setMsg(e.status === 503 ? t('The AI is not turned on on this server yet. Ask your administrator.') : e.status === 402 ? t('The monthly AI limit for this installation was reached. It renews next month.') : e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="mb-2">
      <Button size="sm" variant="outline" onClick={go} disabled={busy || disabled} data-testid={testId}>{busy ? t('Writing…') : label}</Button>
      {msg && <p className="text-xs text-muted mt-1.5" data-testid="ai-msg">{msg}</p>}
    </div>
  );
}
