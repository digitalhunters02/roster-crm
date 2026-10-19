// Optional connector (off by default): sends the hours invoices to the owner's Rex. Connects with a 6-digit code made in
// Rex (Integrations) or with a pasted API key. Only talks to this product's own server.
import { useEffect, useState } from 'react';
import api from '../api.js';
import { Card, CardHead, Button, Field, TextInput, FormError } from './ui.jsx';
import { useT } from '../auth/i18n.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function RexConnectorCard() {
  const { t } = useT();
  const { account } = useAuth();
  const [st, setSt] = useState(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [pair, setPair] = useState({ email: '', code: '' });
  const [apiKey, setApiKey] = useState('');
  const [old, setOld] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const owner = account?.role === 'owner';

  const load = () => api.connectorStatus().then((s) => { setSt(s); setBaseUrl((u) => s.baseUrl || u); }).catch(() => {});
  useEffect(() => { if (owner) load(); }, [owner]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!owner || !st) return null;

  const run = async (fn) => { setBusy(true); setError(null); setNote(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const byCode = () => run(async () => { const s = await api.connectorPair({ baseUrl, email: pair.email.trim(), code: pair.code }); setSt(s); setPair({ email: '', code: '' }); setNote(t('Connected to Rex.')); });
  const byKey = () => run(async () => { const s = await api.connectorSave({ enabled: true, baseUrl, apiKey }); setSt(s); setApiKey(''); setNote(t('Connected to Rex.')); });
  const off = () => run(async () => setSt(await api.connectorSave({ enabled: false })));
  const remove = () => run(async () => setSt(await api.connectorRemove()));
  const resend = () => run(async () => { const r = await api.connectorResync(old); setSt(r.status); setNote(t('Sent {a}, failed {b}.', { a: r.sent, b: r.failed })); });
  const codeOk = pair.code.replace(/\s/g, '').length === 6;

  return (
    <Card className="p-1" data-testid="rex-connector">
      <CardHead title={t('Send invoices to Rex')} sub={t('Optional. Each invoice you send here also appears in your Rex as money to receive, and is marked as paid there when you mark it paid here. Off by default.')} />
      <div className="px-5 pb-5 text-sm">
        <p className={`mb-3 ${st.enabled ? 'text-emerald' : 'text-muted'}`}>
          {st.enabled ? `${t('Connected and sending')}${st.remote?.planName ? ` · Rex ${st.remote.planName}` : ''} · ${t('Sent: {a} · Waiting: {b}', { a: st.synced, b: st.pending })}` : t('Off')}
        </p>
        {st.authFailed && <p role="alert" className="mb-3 text-rose">{t('The connection to Rex stopped working (key revoked or plan changed). Create a new code in Rex.')}</p>}
        <Field label={t('Address of the Rex API')}>
          <TextInput value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://..." data-testid="rex-url" />
        </Field>
        <div className="rounded-md border border-line p-3 mb-3">
          <p className="font-semibold text-ink mb-1">{t('Easiest way: connect with a code')}</p>
          <p className="text-xs text-muted mb-2">{t('In Rex, open Integrations and tap "Generate code". Then type your Rex email and the 6-digit code here. No key to copy.')}</p>
          <Field label={t('Your Rex email')}><TextInput type="email" autoComplete="off" value={pair.email} onChange={(e) => setPair({ ...pair, email: e.target.value })} data-testid="rex-email" /></Field>
          <Field label={t('6-digit code')}><TextInput inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={pair.code} onChange={(e) => setPair({ ...pair, code: e.target.value.replace(/[^\d ]/g, '') })} data-testid="rex-code" /></Field>
          <Button onClick={byCode} disabled={busy || !baseUrl || !pair.email.trim() || !codeOk} data-testid="rex-pair">{t('Connect with code')}</Button>
        </div>
        <details className="mb-3">
          <summary className="cursor-pointer text-xs text-muted">{t('Or paste an API key instead')}</summary>
          <div className="mt-2">
            <Field label={t('Rex API key')} hint={st.keySaved ? t('Key saved. Leave blank to keep it.') : undefined}>
              <TextInput type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="rex_live_..." />
            </Field>
            <Button variant="ghost" onClick={byKey} disabled={busy || !baseUrl || (!apiKey && !st.keySaved)}>{t('Save and turn on')}</Button>
          </div>
        </details>
        <FormError error={error} />
        {note && <p role="status" className="mb-3 text-emerald">{note}</p>}
        <div className="flex flex-wrap items-center gap-3">
          {st.enabled && <button className="text-xs text-muted hover:underline" onClick={off} disabled={busy}>{t('Turn off')}</button>}
          {st.keySaved && <button className="text-xs text-rose hover:underline" onClick={remove} disabled={busy}>{t('Remove key')}</button>}
          {st.appUrl && <a className="text-xs text-brand hover:underline" href={st.appUrl} target="_blank" rel="noreferrer">{t('Open Rex')}</a>}
        </div>
        {st.enabled && (
          <div className="mt-4 pt-4 border-t border-line">
            <label className="flex items-center gap-2 text-xs mb-2"><input type="checkbox" checked={old} onChange={(e) => setOld(e.target.checked)} /> {t('Also send invoices from before')}</label>
            <Button variant="ghost" onClick={resend} disabled={busy}>{t('Resend pending')}</Button>
            {st.log?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-muted mb-1">{t('Last activity')}</p>
                <ul className="text-xs text-muted">{st.log.slice(0, 6).map((l, i) => <li key={i} className={l.ok ? '' : 'text-rose'}>{l.ok ? '✓' : '✗'} {l.message}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
