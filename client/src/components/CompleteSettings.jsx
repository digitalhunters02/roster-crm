// Settings cards of the Complete plan: offices, connections (AI, e-signature), and for developers: API keys and webhooks.
import { useEffect, useState } from 'react';
import api from '../api.js';
import { Card, CardHead, Button, Badge, Field, TextInput, SelectInput, FormError, IconButton, Spinner } from './ui.jsx';
import Icon from './Icon.jsx';
import { useT } from '../auth/i18n.js';
import { useBilling } from '../billing/useBilling.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { loadOffices } from '../offices/useOffices.js';
import { LockedNote } from '../plans/LockedNote.jsx';

const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };


export function OfficesCard() {
  const { t } = useT();
  const { billing } = useBilling();
  const { account } = useAuth();
  const owner = account?.role === 'owner';
  const open = billing?.features?.offices === true;
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState(null);
  const load = () => { api.offices().then(setRows).catch(() => setRows([])); loadOffices(); };
  useEffect(() => { if (open) { load(); api.users().then(setUsers).catch(() => {}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function add() { setError(null); try { await api.createOffice({ name, city }); setName(''); setCity(''); load(); } catch (e) { setError(e.message); } }
  async function remove(o) { try { await api.deleteOffice(o.id); load(); } catch (e) { setError(e.message); } }
  async function assign(u, office_id) { try { await api.setUserOffice(u.id, office_id || null); api.users().then(setUsers); load(); } catch (e) { setError(e.message); } }
  return (
    <Card className="p-1" data-testid="offices-card">
      <CardHead title={t('Offices')} sub={t('Run several locations in one account')} />
      {!open ? <LockedNote gate="offices" /> : (
        <div className="px-5 pb-5 text-sm space-y-3">
          <FormError error={error} />
          {!rows ? <Spinner /> : rows.length === 0 ? <p className="text-muted">{t('No offices yet.')}</p> : (
            <ul className="divide-y divide-lineSoft border border-lineSoft rounded-lg">
              {rows.map((o) => (
                <li key={o.id} className="px-3 py-2 flex flex-wrap items-center gap-2" data-testid="office-row">
                  <span className="font-medium text-ink">{o.name}</span>{o.city && <span className="text-muted">{o.city}</span>}
                  <span className="text-xs text-faint">{t('{n} recruiters · {j} jobs · {c} candidates', { n: o.user_count, j: o.job_count, c: o.candidate_count })}</span>
                  {owner && <span className="ml-auto"><IconButton icon="trash" tone="danger" title={t('Delete')} onClick={() => remove(o)} /></span>}
                </li>
              ))}
            </ul>
          )}
          {owner && (
            <div className="flex flex-wrap gap-2">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Office name')} aria-label={t('Office name')} maxLength={80} data-testid="office-name" />
              <TextInput value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('City (optional)')} aria-label={t('City (optional)')} maxLength={80} />
              <Button size="sm" onClick={add} disabled={!name.trim()} data-testid="office-add">{t('Add office')}</Button>
            </div>
          )}
          {rows && rows.length > 0 && owner && users.length > 0 && (
            <div>
              <p className="font-semibold text-ink mb-1.5">{t('Recruiters')}</p>
              <ul className="space-y-1.5">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate text-ink">{u.name}</span>
                    <SelectInput value={u.office_id ?? ''} onChange={(e) => assign(u, e.target.value)} aria-label={`${t('Office')}: ${u.name}`}>
                      <option value="">{t('No office')}</option>
                      {rows.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </SelectInput>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function ConnectionsCard() {
  const { t } = useT();
  const { billing } = useBilling();
  const open = billing?.features?.ai === true;
  const [ai, setAi] = useState(null);
  const [sig, setSig] = useState(null);
  useEffect(() => { if (open) { api.aiStatus().then(setAi).catch(() => {}); api.signatureStatus().then(setSig).catch(() => {}); } }, [open]);
  return (
    <Card className="p-1" data-testid="connections-card">
      <CardHead title={t('AI & e-signature')} sub={t('Tools of the Complete plan')} />
      {!open ? <LockedNote gate="ai" /> : (
        <div className="px-5 pb-5 text-sm space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink">{t('AI writing')}</span>
            {ai ? (ai.configured ? <Badge tone="green">{t('{used} of {limit} used this month', { used: ai.used, limit: ai.limit })}</Badge> : <Badge tone="amber">{t('Not turned on')}</Badge>) : <Spinner />}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink">{t('E-signature (Documenso)')}</span>
            {sig ? (sig.connected ? <Badge tone="green">{t('Connected')}</Badge> : <Badge tone="amber">{t('Not connected')}</Badge>) : <Spinner />}
          </div>
          <p className="text-xs text-faint">{t('Both are set up by your administrator on the server.')}</p>
        </div>
      )}
    </Card>
  );
}

export function DeveloperCard() {
  const { t } = useT();
  const { billing } = useBilling();
  const { account } = useAuth();
  const owner = account?.role === 'owner';
  const open = billing?.features?.api === true && owner;
  const [keys, setKeys] = useState(null);
  const [hooks, setHooks] = useState(null);
  const [events, setEvents] = useState([]);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState(null);
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState([]);
  const [newSecret, setNewSecret] = useState(null);
  const [error, setError] = useState(null);
  const [testMsg, setTestMsg] = useState({});
  const load = () => { api.apiKeys().then(setKeys).catch(() => setKeys([])); api.webhooks().then(setHooks).catch(() => setHooks([])); };
  useEffect(() => { if (open) { load(); api.webhookEvents().then(setEvents).catch(() => {}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const fail = (e) => setError(e.message);
  async function addKey() { setError(null); try { const k = await api.createApiKey(keyName); setNewKey(k.key); setKeyName(''); load(); } catch (e) { fail(e); } }
  async function revoke(k) { try { await api.deleteApiKey(k.id); load(); } catch (e) { fail(e); } }
  async function addHook() { setError(null); try { const h = await api.createWebhook({ url, events: picked }); setNewSecret(h.secret); setUrl(''); setPicked([]); load(); } catch (e) { fail(e); } }
  async function toggle(h) { try { await api.setWebhookActive(h.id, !h.active); load(); } catch (e) { fail(e); } }
  async function removeHook(h) { try { await api.deleteWebhook(h.id); load(); } catch (e) { fail(e); } }
  async function test(h) { try { const r = await api.testWebhook(h.id); setTestMsg((m) => ({ ...m, [h.id]: r.ok ? t('Delivered ({code})', { code: r.code }) : t('Failed: {why}', { why: r.error || r.code }) })); load(); } catch (e) { fail(e); } }
  const baseUrl = `${window.location.origin}/api/v1`;
  return (
    <Card className="p-1 lg:col-span-2" data-testid="developer-card">
      <CardHead title={t('API & webhooks')} sub={t('Connect Roster to your other tools (Zapier, Make, your website)')} />
      {!(billing?.features?.api === true) ? <LockedNote gate="api" />
        : !owner ? <p className="px-5 pb-5 text-sm text-muted">{t('Only the account owner can manage API keys and webhooks.')}</p> : (
          <div className="px-5 pb-5 text-sm grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2"><FormError error={error} /></div>
            <div className="space-y-3">
              <p className="font-semibold text-ink">{t('API keys')}</p>
              <p className="text-xs text-muted break-all">{t('Send the key as “Authorization: Bearer <key>” to')} <code>{baseUrl}/candidates</code> {t('(also jobs, clients, submissions, placements, timesheets). POST /candidates adds a candidate.')}</p>
              {newKey && (
                <div className="rounded-md bg-greenTint border border-green/30 px-3 py-2" data-testid="new-key">
                  <p className="text-xs text-ink mb-1">{t('Copy it now: it will not be shown again.')}</p>
                  <input readOnly value={newKey} onFocus={(e) => e.target.select()} className="w-full rounded border border-line bg-white px-2 py-1 text-xs" aria-label={t('New API key')} data-testid="new-key-value" />
                </div>
              )}
              {!keys ? <Spinner /> : keys.length === 0 ? <p className="text-muted">{t('No keys yet.')}</p> : (
                <ul className="divide-y divide-lineSoft border border-lineSoft rounded-lg">
                  {keys.map((k) => (
                    <li key={k.id} className="px-3 py-2 flex flex-wrap items-center gap-2" data-testid="key-row">
                      <span className="font-medium text-ink">{k.name}</span><code className="text-xs text-muted">{k.key_prefix}…</code>
                      <span className="text-xs text-faint">{k.last_used_at ? t('Last used {when}', { when: when(k.last_used_at) }) : t('Never used')}</span>
                      <span className="ml-auto"><Button size="sm" variant="outline" onClick={() => revoke(k)}>{t('Revoke')}</Button></span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <TextInput value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder={t('Key name, e.g. Zapier')} aria-label={t('Key name, e.g. Zapier')} maxLength={60} data-testid="key-name" />
                <Button size="sm" onClick={addKey} disabled={!keyName.trim()} data-testid="key-add">{t('Create key')}</Button>
              </div>
            </div>
            <div className="space-y-3">
              <p className="font-semibold text-ink">{t('Webhooks')}</p>
              <p className="text-xs text-muted">{t('We POST a signed JSON message to your https address. Check the X-Roster-Signature header with your secret.')}</p>
              {newSecret && (
                <div className="rounded-md bg-greenTint border border-green/30 px-3 py-2" data-testid="new-secret">
                  <p className="text-xs text-ink mb-1">{t('Signing secret. Copy it now: it will not be shown again.')}</p>
                  <input readOnly value={newSecret} onFocus={(e) => e.target.select()} className="w-full rounded border border-line bg-white px-2 py-1 text-xs" aria-label={t('Signing secret')} />
                </div>
              )}
              {!hooks ? <Spinner /> : hooks.length === 0 ? <p className="text-muted">{t('No webhooks yet.')}</p> : (
                <ul className="divide-y divide-lineSoft border border-lineSoft rounded-lg">
                  {hooks.map((h) => (
                    <li key={h.id} className="px-3 py-2 space-y-1" data-testid="hook-row">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink break-all">{h.url}</span>
                        <Badge tone={h.active ? 'green' : 'neutral'}>{h.active ? t('On') : t('Off')}</Badge>
                      </div>
                      <p className="text-xs text-muted break-words">{h.events === '*' ? t('All events') : h.events}{h.last ? ` · ${t('last')}: ${h.last.ok ? 'OK' : (h.last.error || h.last.status_code)} · ${when(h.last.created_at)}` : ''}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => test(h)}>{t('Send test')}</Button>
                        <Button size="sm" variant="outline" onClick={() => toggle(h)}>{h.active ? t('Turn off') : t('Turn on')}</Button>
                        <IconButton icon="trash" tone="danger" title={t('Delete')} onClick={() => removeHook(h)} />
                        {testMsg[h.id] && <span className="text-xs text-muted">{testMsg[h.id]}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/roster-hook" aria-label={t('Webhook address')} data-testid="hook-url" />
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {events.map((ev) => (
                  <label key={ev} className="flex items-center gap-1.5 text-xs text-ink">
                    <input type="checkbox" checked={picked.includes(ev)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, ev] : p.filter((x) => x !== ev)))} /> {ev}
                  </label>
                ))}
              </div>
              <p className="text-xs text-faint">{t('Nothing ticked = all events.')}</p>
              <Button size="sm" onClick={addHook} disabled={!url.trim()} data-testid="hook-add">{t('Add webhook')}</Button>
            </div>
          </div>
        )}
    </Card>
  );
}
