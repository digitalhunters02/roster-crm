// Staff side of the client portal: turn the private link on/off, copy it, make a new one, see what the client answered.
import { useEffect, useState } from 'react';
import api from '../api.js';
import { Modal, Button, Badge, Spinner, FormError } from './ui.jsx';
import Icon from './Icon.jsx';
import { useT } from '../auth/i18n.js';

const linkOf = (token) => `${window.location.origin}${window.location.pathname}#/portal/${token}`;
const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

export default function ClientPortalModal({ client, onClose, onChanged }) {
  const { t } = useT();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const load = () => api.clientPortal(client.id).then(setInfo).catch((e) => setError(e.status === 402 ? t('The client portal is part of the Essential plan and up.') : e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action) {
    setBusy(true); setError(null);
    try { await api.clientPortalAction(client.id, action); setConfirmNew(false); await load(); onChanged?.(); }
    catch (e) { setError(e.status === 402 ? t('The client portal is part of the Essential plan and up.') : e.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(linkOf(info.token)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the field below can be selected by hand */ }
  }

  return (
    <Modal title={t('Client portal')} sub={client.company_name} onClose={onClose} wide footer={<Button variant="outline" onClick={onClose}>{t('Close')}</Button>}>
      <FormError error={error} />
      {!info && !error && <Spinner />}
      {info && (
        <div className="space-y-4 text-sm" data-testid="portal-modal">
          <p className="text-muted">{t('Give your client one private link. They see the candidates you submitted (never their phone or e-mail), say interested or pass, and approve timesheets and open invoices - no account needed.')}</p>
          {!info.enabled ? (
            <Button onClick={() => act('enable')} disabled={busy} data-testid="portal-enable"><Icon name="check" size={14} /> {t('Turn on the portal link')}</Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input readOnly value={linkOf(info.token)} onFocus={(e) => e.target.select()} aria-label={t('Portal link')} data-testid="portal-link"
                  className="flex-1 min-w-0 rounded-md border border-line bg-wash px-3 py-2 text-xs" />
                <Button size="sm" onClick={copy}>{copied ? t('Copied') : t('Copy')}</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={linkOf(info.token)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-wash">{t('Open as the client')} <Icon name="arrowUpRight" size={13} /></a>
                {!confirmNew
                  ? <Button size="sm" variant="outline" onClick={() => setConfirmNew(true)} disabled={busy}>{t('Make a new link')}</Button>
                  : <Button size="sm" onClick={() => act('rotate')} disabled={busy} data-testid="portal-rotate">{t('Yes: the old link stops working')}</Button>}
                <Button size="sm" variant="outline" onClick={() => act('disable')} disabled={busy} data-testid="portal-disable">{t('Turn off')}</Button>
              </div>
            </div>
          )}
          {info.feedback.length > 0 && (
            <div>
              <p className="font-semibold text-ink mb-1.5">{t('Recent answers from the client')}</p>
              <ul className="divide-y divide-lineSoft border border-lineSoft rounded-lg">
                {info.feedback.map((f) => (
                  <li key={f.id} className="px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge tone={f.decision === 'interested' ? 'green' : 'neutral'}>{f.decision === 'interested' ? t('Interested') : t('Pass')}</Badge>
                    <span className="font-medium text-ink">{f.candidate_name}</span>
                    <span className="text-muted">{f.job_title}</span>
                    <span className="text-faint text-xs ml-auto">{when(f.created_at)}</span>
                    {f.note && <span className="basis-full text-xs text-muted break-words">“{f.note}”</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
