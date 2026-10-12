// Write to one candidate by e-mail, SMS or WhatsApp, from a template or from scratch, and see the whole conversation.
// One person per message on purpose (no bulk sending). SMS goes out through the agency's own Twilio account.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import { Modal, Button, Field, TextInput, TextArea, SelectInput, FormError, Spinner } from './ui.jsx';
import { useT } from '../auth/i18n.js';

const CHANNELS = ['email', 'sms', 'whatsapp'];
const PLACEHOLDERS = ['{{first_name}}', '{{job_title}}', '{{client}}', '{{agency}}', '{{recruiter}}'];
const stamp = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

export default function MessagesModal({ candidate, onClose }) {
  const { t } = useT();
  const [info, setInfo] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [channel, setChannel] = useState('email');
  const [tplId, setTplId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(null); // null | template name being typed

  const reload = () => api.candidateMessages(candidate.id).then(setInfo).catch((e) => setError(e.message));
  useEffect(() => {
    reload();
    api.messageTemplates().then(setTemplates).catch((e) => setError(e.status === 402 ? t('Messaging is part of the Essential plan and up.') : e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const state = info?.channels?.[channel];
  const problem = !state ? '' : !state.has_contact
    ? (channel === 'email' ? t('This candidate has no e-mail address.') : t('This candidate has no mobile number.'))
    : channel === 'sms' && state.opted_out ? t('This person replied STOP and does not want SMS.')
    : !state.ready ? (channel === 'email' ? t('E-mail is not set up on this server yet. Ask your administrator.') : null) : '';
  const needsConnect = state && state.has_contact && !state.ready && channel !== 'email';
  const listed = templates.filter((x) => x.channel === 'any' || x.channel === channel);

  function pickTemplate(id) {
    setTplId(id); setPreview(null);
    const tpl = templates.find((x) => String(x.id) === String(id));
    if (tpl) { setBody(tpl.body); setSubject(tpl.subject || ''); }
  }
  async function doPreview() {
    setError(null);
    try { setPreview(await api.previewMessage(candidate.id, { subject, body })); } catch (e) { setError(e.message); }
  }
  async function doSend() {
    setBusy(true); setError(null); setSent(false);
    try { await api.sendMessage(candidate.id, { channel, subject, body }); setBody(''); setSubject(''); setTplId(''); setPreview(null); setSent(true); await reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function saveTemplate() {
    setError(null);
    try {
      const created = await api.createMessageTemplate({ name: saving, channel: 'any', subject, body });
      setTemplates((p) => [...p, created].sort((a, b) => a.name.localeCompare(b.name))); setTplId(String(created.id)); setSaving(null);
    } catch (e) { setError(e.message); }
  }
  async function deleteTemplate() {
    try { await api.deleteMessageTemplate(tplId); setTemplates((p) => p.filter((x) => String(x.id) !== String(tplId))); setTplId(''); }
    catch (e) { setError(e.message); }
  }

  return (
    <Modal title={t('Messages')} sub={candidate.name} onClose={onClose} wide footer={<Button variant="outline" onClick={onClose}>{t('Close')}</Button>}>
      <div className="space-y-4 text-sm" data-testid="messages-modal">
        <div className="flex gap-1.5" role="tablist">
          {CHANNELS.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={channel === c} data-testid={`msg-tab-${c}`}
              onClick={() => { setChannel(c); setSent(false); setError(null); setPreview(null); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border ${channel === c ? 'bg-brand text-white border-brand' : 'border-line text-ink hover:bg-wash'}`}>
              {c === 'email' ? t('E-mail') : c === 'sms' ? 'SMS' : 'WhatsApp'}
            </button>
          ))}
        </div>

        {problem && <p className="text-amber bg-amberTint rounded-md px-3 py-2" data-testid="msg-problem">{problem}</p>}
        {needsConnect && (
          <p className="text-amber bg-amberTint rounded-md px-3 py-2" data-testid="msg-connect">
            {channel === 'sms' ? t('Connect your Twilio account to send SMS.') : t('Connect WhatsApp to send messages.')}{' '}
            <Link to="/settings" className="underline font-medium">{t('Open Settings')}</Link>
          </p>
        )}

        <Field label={t('Template')}>
          <div className="flex gap-2">
            <SelectInput value={tplId} onChange={(e) => pickTemplate(e.target.value)} data-testid="msg-template">
              <option value="">{t('Write from scratch')}</option>
              {listed.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </SelectInput>
            {tplId && <Button size="sm" variant="outline" onClick={deleteTemplate}>{t('Delete template')}</Button>}
          </div>
        </Field>
        {channel === 'email' && (
          <Field label={t('Subject')}>
            <TextInput value={subject} onChange={(e) => { setSubject(e.target.value); setPreview(null); }} maxLength={200} data-testid="msg-subject" />
          </Field>
        )}
        <Field label={t('Message')} hint={`${t('Fills in automatically')}: ${PLACEHOLDERS.join('  ')}`}>
          <TextArea value={body} onChange={(e) => { setBody(e.target.value); setPreview(null); setSent(false); }} rows={5} maxLength={channel === 'sms' ? 1000 : 4000} data-testid="msg-body" />
        </Field>
        {channel === 'sms' && <p className="text-xs text-faint -mt-2">{body.length}/1000 · {t('The first SMS to a person ends with “Reply STOP to opt out.”')}</p>}

        {preview && (
          <div className="rounded-lg border border-line bg-wash p-3" data-testid="msg-preview">
            <p className="text-xs uppercase tracking-wide text-muted mb-1">{t('Preview')}</p>
            {channel === 'email' && preview.subject && <p className="font-semibold text-ink break-words">{preview.subject}</p>}
            <p className="whitespace-pre-line break-words text-ink">{preview.body}</p>
            {preview.missing.length > 0 && <p className="text-xs text-amber mt-2">{t('Not filled in for this person')}: {preview.missing.join(', ')}</p>}
          </div>
        )}

        <FormError error={error} />
        {sent && <p className="text-green bg-greenTint border border-green/30 rounded-md px-3 py-2" data-testid="msg-sent">{t('Message sent')}</p>}

        {saving === null ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={doPreview} disabled={!body.trim()} data-testid="msg-preview-btn">{t('Preview')}</Button>
            <Button size="sm" variant="outline" onClick={() => setSaving('')} disabled={!body.trim()}>{t('Save as template')}</Button>
            <Button size="sm" onClick={doSend} disabled={busy || !body.trim() || !!problem || needsConnect} data-testid="msg-send">{busy ? t('Sending…') : t('Send')}</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <TextInput value={saving} onChange={(e) => setSaving(e.target.value)} placeholder={t('Template name')} maxLength={80} aria-label={t('Template name')} data-testid="msg-tpl-name" />
            <Button size="sm" onClick={saveTemplate} disabled={!saving.trim()}>{t('Save')}</Button>
            <Button size="sm" variant="outline" onClick={() => setSaving(null)}>{t('Cancel')}</Button>
          </div>
        )}

        <div>
          <p className="font-semibold text-ink mb-1.5">{t('Conversation')}</p>
          {!info ? <Spinner /> : info.history.length === 0 ? <p className="text-muted">{t('No messages yet.')}</p> : (
            <ul className="space-y-2 max-h-64 overflow-y-auto" data-testid="msg-history">
              {info.history.map((m, i) => (
                <li key={i} className={`rounded-lg px-3 py-2 max-w-[85%] ${m.direction === 'out' ? 'ml-auto bg-brandTint' : 'bg-wash'}`}>
                  <p className="text-[11px] text-faint">{m.channel === 'email' ? t('E-mail') : m.channel === 'sms' ? 'SMS' : 'WhatsApp'} · {m.direction === 'out' ? t('You') : candidate.name} · {stamp(m.created_at)}</p>
                  {m.subject && <p className="font-medium text-ink break-words">{m.subject}</p>}
                  <p className="whitespace-pre-line break-words text-ink">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
