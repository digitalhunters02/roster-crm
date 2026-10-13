// Client portal: opened by the agency's client from a private link, no sign-in. Shows the candidates submitted to them
// (no contact details), lets them say interested / pass, and approve or dispute timesheets and open invoices.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { portalApi } from '../api.js';
import { Card, Badge, Button, Spinner, TextInput, TextArea } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import InvoiceView from '../components/InvoiceView.jsx';
import { useT, LANGS } from '../auth/i18n.js';

const usd = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const day = (iso) => {
  const d = new Date(`${String(iso || '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
// The server answers in English; the portal shows the same sentence in the visitor's language.
const ERR = {
  invalid_decision: 'Choose "Interested" or "Pass".',
  not_found: 'We could not find that item.',
  already_paid: 'This invoice is already paid.',
  name_required: 'Type your name to approve.',
  note_required: 'Tell us what looks wrong.',
  rate_limited: 'Too many requests. Try again in a moment.',
};
const fail = (e, t) => (ERR[e.code] ? t(ERR[e.code]) : e.message);
const STAGE_TONE = { 'Submitted to Client': 'blue', 'Client Interview': 'amber', Offer: 'green' };
const STATUS_TONE = { Sent: 'blue', Paid: 'green', Overdue: 'rose' };

function CandidateCard({ c, token, onChanged }) {
  const { t, tq } = useT();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(decision) {
    setBusy(true); setError('');
    try { await portalApi.feedback(token, { submission_id: c.submission_id, decision, note }); setNote(''); await onChanged(); }
    catch (e) { setError(fail(e, t)); } finally { setBusy(false); }
  }
  return (
    <Card className="p-4" data-testid="portal-candidate">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink break-words">{c.name}</p>
          <p className="text-sm text-muted break-words">{c.current_title || t('No title')} · {c.job_title}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge tone={STAGE_TONE[c.stage] || 'neutral'}>{tq(c.stage)}</Badge>
          {c.decision && <Badge tone={c.decision === 'interested' ? 'green' : 'neutral'}>{c.decision === 'interested' ? t('You: interested') : t('You: pass')}</Badge>}
        </div>
      </div>
      {c.skills && <p className="text-sm text-muted mt-2 break-words"><span className="font-medium text-ink">{t('Skills')}:</span> {c.skills}</p>}
      {c.resume_summary && <p className="text-sm text-muted mt-1 break-words">{c.resume_summary}</p>}
      {c.decision_note && <p className="text-xs text-faint mt-2 break-words">“{c.decision_note}”</p>}
      <div className="mt-3 flex flex-col gap-2">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t('Add a note (optional)')} aria-label={t('Add a note (optional)')} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => decide('interested')} disabled={busy} data-testid="portal-interested"><Icon name="check" size={13} /> {t('Interested')}</Button>
          <Button size="sm" variant="outline" onClick={() => decide('pass')} disabled={busy} data-testid="portal-pass">{t('Pass')}</Button>
        </div>
        {error && <p className="text-sm text-rose" role="alert">{error}</p>}
      </div>
    </Card>
  );
}

function TimesheetRow({ ts, token, onChanged, onInvoice }) {
  const { t, tq } = useT();
  const [mode, setMode] = useState(null); // 'approve' | 'dispute'
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = ts.status !== 'Paid';
  async function submit() {
    setBusy(true); setError('');
    try {
      if (mode === 'approve') await portalApi.approve(token, ts.id, { by_name: name });
      else await portalApi.dispute(token, ts.id, { note, by_name: name });
      setMode(null); setNote(''); await onChanged();
    } catch (e) { setError(fail(e, t)); } finally { setBusy(false); }
  }
  return (
    <Card className="p-4" data-testid="portal-timesheet">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink break-words">{ts.number} · {ts.candidate_name}</p>
          <p className="text-sm text-muted break-words">{ts.job_title} · {day(ts.period_start)} – {day(ts.period_end)} · {ts.hours} {t('hours')}</p>
        </div>
        <div className="text-right">
          <p className="font-display font-semibold">{usd(ts.amount)}</p>
          <div className="flex gap-1.5 justify-end mt-1 flex-wrap">
            <Badge tone={STATUS_TONE[ts.status] || 'neutral'}>{tq(ts.status)}</Badge>
            {ts.client_approved_at && <Badge tone="green">{t('Approved')}</Badge>}
            {!ts.client_approved_at && ts.client_dispute_note && <Badge tone="rose">{t('Disputed')}</Badge>}
          </div>
        </div>
      </div>
      {ts.client_dispute_note && !ts.client_approved_at && <p className="text-xs text-faint mt-2 break-words">“{ts.client_dispute_note}”</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onInvoice(ts.id)} data-testid="portal-view-invoice"><Icon name="receipt" size={13} /> {t('View invoice')}</Button>
        {open && !ts.client_approved_at && <Button size="sm" onClick={() => { setMode('approve'); setError(''); }} data-testid="portal-approve">{t('Approve')}</Button>}
        {open && <Button size="sm" variant="outline" onClick={() => { setMode('dispute'); setError(''); }} data-testid="portal-dispute">{t('Something is wrong')}</Button>}
      </div>
      {mode && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-wash p-3">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('Your name')} aria-label={t('Your name')} />
          {mode === 'dispute' && <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t('Tell us what looks wrong')} aria-label={t('Tell us what looks wrong')} />}
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={busy}>{mode === 'approve' ? t('Confirm approval') : t('Send')}</Button>
            <Button size="sm" variant="outline" onClick={() => setMode(null)} disabled={busy}>{t('Cancel')}</Button>
          </div>
          {error && <p className="text-sm text-rose" role="alert">{error}</p>}
        </div>
      )}
    </Card>
  );
}

export default function Portal() {
  const { token } = useParams();
  const { t, lang, setLang } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [invoiceId, setInvoiceId] = useState(null);

  const load = () => portalApi.load(token).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.status === 404 ? 'gone' : e.message));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-[100dvh] bg-bg" data-testid="portal-page">
      <header className="bg-surface border-b border-line">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {data?.agency.logo && <img src={data.agency.logo} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />}
            <div className="min-w-0">
              <p className="font-display font-semibold text-ink truncate">{data?.agency.name || t('Client portal')}</p>
              {data && <p className="text-xs text-muted truncate">{t('Client portal')} · {data.client.company_name}</p>}
            </div>
          </div>
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('Language')} className="rounded-md border border-line bg-surface text-sm px-2 py-1.5">
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-6">
        {!data && !error && <Spinner />}
        {error === 'gone' && (
          <Card className="p-8 text-center" data-testid="portal-gone">
            <div className="w-12 h-12 rounded-full bg-brandTint text-brand flex items-center justify-center mx-auto mb-4"><Icon name="lock" size={20} /></div>
            <h1 className="text-lg font-semibold text-ink mb-1.5">{t('This link is not active')}</h1>
            <p className="text-sm text-muted">{t('Ask your recruiter for a new link.')}</p>
          </Card>
        )}
        {error && error !== 'gone' && <p className="text-sm text-rose" role="alert">{error}</p>}
        {data && (
          <>
            <section>
              <h2 className="font-display text-base font-semibold text-ink mb-2">{t('Candidates for you')}</h2>
              {data.candidates.length === 0
                ? <Card className="p-5 text-sm text-muted">{t('Nothing to review right now. New candidates will appear here.')}</Card>
                : <div className="space-y-3">{data.candidates.map((c) => <CandidateCard key={c.submission_id} c={c} token={token} onChanged={load} />)}</div>}
            </section>
            <section>
              <h2 className="font-display text-base font-semibold text-ink mb-2">{t('Timesheets & invoices')}</h2>
              {data.timesheets.length === 0
                ? <Card className="p-5 text-sm text-muted">{t('No invoices yet.')}</Card>
                : <div className="space-y-3">{data.timesheets.map((ts) => <TimesheetRow key={ts.id} ts={ts} token={token} onChanged={load} onInvoice={setInvoiceId} />)}</div>}
            </section>
            {(data.agency.email || data.agency.phone) && (
              <p className="text-xs text-muted text-center pb-4">{t('Questions? Contact')} {[data.agency.email, data.agency.phone].filter(Boolean).join(' · ')}</p>
            )}
          </>
        )}
      </main>
      {invoiceId && <InvoiceView load={() => portalApi.invoice(token, invoiceId)} onClose={() => setInvoiceId(null)} />}
    </div>
  );
}
