// For one candidate or client: documents with expiry dates (a reminder list - Roster does not check them) and
// e-signature requests sent through the agency's own Documenso with the agency's own PDF.
import { useEffect, useRef, useState } from 'react';
import api, { BASE } from '../api.js';
import { authHeaders } from '../auth/session.js';
import { Modal, Button, Badge, Field, TextInput, TextArea, SelectInput, FormError, Spinner, IconButton } from './ui.jsx';
import { useT } from '../auth/i18n.js';

const SIG_LABEL = { sent: 'Sent for signature', viewed: 'Viewed', signed: 'Signed', declined: 'Declined', error: 'Failed' };
const STATUS_TONE = { sent: 'blue', viewed: 'amber', signed: 'green', declined: 'rose', error: 'rose' };
const DOC_STATUS_TONE = { Requested: 'amber', Received: 'blue', Verified: 'green' };
const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysLeft = (iso) => Math.ceil((new Date(`${iso}T00:00:00Z`) - new Date(`${todayIso()}T00:00:00Z`)) / 86400000);

function Documents({ candidate }) {
  const { t, tq } = useT();
  const [meta, setMeta] = useState({ types: [], statuses: [] });
  const [docs, setDocs] = useState(null);
  const [form, setForm] = useState({ doc_type: 'I-9', status: 'Requested', expires_on: '', notes: '' });
  const [error, setError] = useState(null);
  const load = () => api.candidateDocuments(candidate.id).then(setDocs).catch((e) => setError(e.message));
  useEffect(() => { api.documentMeta().then(setMeta).catch(() => {}); load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function add() {
    setError(null);
    try { await api.createDocument(candidate.id, form); setForm({ doc_type: form.doc_type, status: 'Requested', expires_on: '', notes: '' }); await load(); } catch (e) { setError(e.message); }
  }
  async function setStatus(d, status) { try { await api.updateDocument(d.id, { status }); await load(); } catch (e) { setError(e.message); } }
  async function remove(d) { try { await api.deleteDocument(d.id); await load(); } catch (e) { setError(e.message); } }
  return (
    <section data-testid="docs-section">
      <h4 className="font-semibold text-ink mb-1">{t('Documents')}</h4>
      <p className="text-xs text-muted mb-3">{t('A reminder list: what you asked for, what arrived and when it expires. Roster does not check documents and this is not legal advice.')}</p>
      <FormError error={error} />
      {!docs ? <Spinner /> : docs.length === 0 ? <p className="text-sm text-muted mb-3">{t('No documents yet.')}</p> : (
        <ul className="divide-y divide-lineSoft border border-lineSoft rounded-lg mb-3">
          {docs.map((d) => {
            const left = d.expires_on ? daysLeft(d.expires_on) : null;
            return (
              <li key={d.id} className="px-3 py-2 flex flex-wrap items-center gap-2" data-testid="doc-row">
                <span className="font-medium text-ink">{tq(d.doc_type)}</span>
                <Badge tone={DOC_STATUS_TONE[d.status] || 'neutral'}>{tq(d.status)}</Badge>
                {d.expires_on && <Badge tone={left < 0 ? 'rose' : left <= 30 ? 'amber' : 'neutral'}>{left < 0 ? t('Expired {date}', { date: when(d.expires_on) }) : t('Expires {date}', { date: when(d.expires_on) })}</Badge>}
                {d.notes && <span className="text-xs text-muted break-words">{d.notes}</span>}
                <span className="ml-auto flex items-center gap-1">
                  {d.status !== 'Received' && d.status !== 'Verified' && <Button size="sm" variant="outline" onClick={() => setStatus(d, 'Received')}>{t('Mark received')}</Button>}
                  {d.status === 'Received' && <Button size="sm" variant="outline" onClick={() => setStatus(d, 'Verified')}>{t('Mark verified')}</Button>}
                  <IconButton icon="trash" tone="danger" title={t('Delete')} onClick={() => remove(d)} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <SelectInput value={form.doc_type} onChange={set('doc_type')} aria-label={t('Document type')} data-testid="doc-type">{meta.types.map((x) => <option key={x} value={x}>{tq(x)}</option>)}</SelectInput>
        <SelectInput value={form.status} onChange={set('status')} aria-label={t('Status')}>{meta.statuses.map((x) => <option key={x} value={x}>{tq(x)}</option>)}</SelectInput>
        <TextInput type="date" value={form.expires_on} onChange={set('expires_on')} aria-label={t('Expires on')} data-testid="doc-expires" />
      </div>
      <div className="flex gap-2 mt-2">
        <TextInput value={form.notes} onChange={set('notes')} placeholder={t('Note (optional)')} maxLength={300} aria-label={t('Note (optional)')} />
        <Button size="sm" onClick={add} data-testid="doc-add">{t('Add')}</Button>
      </div>
    </section>
  );
}

function Signatures({ kind, record }) {
  const { t } = useT();
  const [status, setStatus] = useState(null);
  const [list, setList] = useState(null);
  const [f, setF] = useState({ title: '', signer_name: '', signer_email: '', message: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const load = () => api.signatures(kind, record.id).then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    api.signatureStatus().then(setStatus).catch(() => setStatus({ connected: false }));
    api.signatureDefaults(kind, record.id).then((d) => setF((x) => ({ ...x, signer_name: d.signer_name, signer_email: d.signer_email }))).catch(() => {});
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function send() {
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.append('kind', kind); form.append('related_id', record.id);
      for (const [k, v] of Object.entries(f)) form.append(k, v);
      form.append('file', file);
      await api.sendSignature(form);
      setFile(null); if (fileRef.current) fileRef.current.value = ''; setF((x) => ({ ...x, title: '', message: '' }));
      await load();
    } catch (e) { setError(e.message); await load(); } finally { setBusy(false); }
  }
  async function refresh(r) { try { await api.refreshSignature(r.id); await load(); } catch (e) { setError(e.message); } }
  async function remove(r) { try { await api.deleteSignature(r.id); await load(); } catch (e) { setError(e.message); } }
  async function download(r) {
    try {
      const res = await fetch(`${BASE}/signatures/${r.id}/signed`, { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; a.download = `${r.title} - signed.pdf`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setError(e.message); }
  }
  return (
    <section data-testid="signatures-section">
      <h4 className="font-semibold text-ink mb-1">{t('E-signature')}</h4>
      <p className="text-xs text-muted mb-3">{t('Send your own PDF (offer letter, agreement…) for signature. It goes out from your Documenso account; Roster does not write or review the contract.')}</p>
      {status && !status.connected && <p className="text-amber bg-amberTint rounded-md px-3 py-2 mb-3 text-sm" data-testid="sig-not-connected">{t('E-signature is not connected on this server yet. Ask your administrator.')}</p>}
      <FormError error={error} />
      {list && list.length > 0 && (
        <ul className="divide-y divide-lineSoft border border-lineSoft rounded-lg mb-3" data-testid="sig-list">
          {list.map((r) => (
            <li key={r.id} className="px-3 py-2 flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink break-words">{r.title}</span>
              <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{t(SIG_LABEL[r.status] || r.status)}</Badge>
              <span className="text-xs text-muted">{r.signer_name} · {when(r.created_at)}</span>
              {r.error && <span className="basis-full text-xs text-rose break-words">{r.error}</span>}
              <span className="ml-auto flex items-center gap-1">
                {(r.status === 'sent' || r.status === 'viewed') && <Button size="sm" variant="outline" onClick={() => refresh(r)}>{t('Check status')}</Button>}
                {r.has_signed_file && <Button size="sm" onClick={() => download(r)} data-testid="sig-download">{t('Download signed PDF')}</Button>}
                {r.status === 'error' && <IconButton icon="trash" tone="danger" title={t('Delete')} onClick={() => remove(r)} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label={t('PDF to sign')} data-testid="sig-file" className="block w-full text-sm" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <TextInput value={f.signer_name} onChange={set('signer_name')} placeholder={t('Signer name')} aria-label={t('Signer name')} data-testid="sig-name" />
          <TextInput type="email" value={f.signer_email} onChange={set('signer_email')} placeholder={t('Signer e-mail')} aria-label={t('Signer e-mail')} data-testid="sig-email" />
        </div>
        <TextInput value={f.title} onChange={set('title')} placeholder={t('Document title (optional)')} aria-label={t('Document title (optional)')} maxLength={120} />
        <TextArea value={f.message} onChange={set('message')} rows={2} placeholder={t('Message to the signer (optional)')} aria-label={t('Message to the signer (optional)')} maxLength={500} />
        <Button size="sm" onClick={send} disabled={busy || !file || !f.signer_name.trim() || !f.signer_email.trim()} data-testid="sig-send">{busy ? t('Sending…') : t('Send for signature')}</Button>
      </div>
    </section>
  );
}

export default function DocsSignaturesModal({ kind, record, name, onClose }) {
  const { t } = useT();
  return (
    <Modal title={kind === 'candidate' ? t('Documents & signatures') : t('Signatures')} sub={name} onClose={onClose} wide footer={<Button variant="outline" onClick={onClose}>{t('Close')}</Button>}>
      <div className="space-y-6 text-sm" data-testid="docs-modal">
        {kind === 'candidate' && <Documents candidate={record} />}
        <Signatures kind={kind} record={record} />
      </div>
    </Modal>
  );
}
