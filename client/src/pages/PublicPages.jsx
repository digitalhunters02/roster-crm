import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api.js';
import { BRAND, BrandLogo } from '../auth/brand.jsx';
import { longDate } from '../format.js';

// Páginas abertas ao público (sem login): vagas com candidatura e aprovação de horas pelo cliente.
function Shell({ title, sub, children }) {
  return (
    <div className="min-h-[100dvh] bg-wash px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <BrandLogo size={40} />
          <div>
            <div className="font-display text-xl font-semibold text-ink">{title || BRAND.name}</div>
            {sub && <div className="text-xs text-muted">{sub}</div>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
const box = 'bg-surface border border-line rounded-2xl shadow-sm p-5';
const inputCls = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';
const btnCls = 'inline-flex items-center rounded-lg bg-brand text-white text-sm font-semibold px-4 py-2 hover:bg-brand/90 disabled:opacity-50';

function ApplyForm({ job, onDone }) {
  const [v, setV] = useState({ name: '', email: '', phone: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api.publicApply(job.id, v); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      {err && <p className="text-sm text-rose bg-roseTint border border-rose/30 rounded-md px-3 py-2">{err}</p>}
      <input className={inputCls} placeholder="Full name" value={v.name} onChange={set('name')} aria-label="Full name" required />
      <input className={inputCls} type="email" placeholder="Email" value={v.email} onChange={set('email')} aria-label="Email" required />
      <input className={inputCls} type="tel" placeholder="Phone (optional)" value={v.phone} onChange={set('phone')} aria-label="Phone" />
      <textarea className={inputCls} rows={3} placeholder="A few words about your experience (optional)" value={v.message} onChange={set('message')} aria-label="Message" />
      {/* isca para robôs: pessoas não veem este campo */}
      <input tabIndex={-1} autoComplete="off" value={v.website} onChange={set('website')} aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} name="website" />
      <button className={btnCls} disabled={busy}>{busy ? 'Sending…' : 'Apply now'}</button>
    </form>
  );
}

export function Careers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [done, setDone] = useState({});
  useEffect(() => { api.publicCareers().then(setData).catch((e) => setError(e.message)); }, []);
  return (
    <Shell title={data?.company ? `Careers at ${data.company}` : 'Open positions'} sub="Find a role and apply in a minute">
      {error && <div className={box}><p className="text-sm text-muted">The careers page is not available right now.</p></div>}
      {!error && !data && <div className={box}><p className="text-sm text-muted">Loading…</p></div>}
      {data && data.jobs.length === 0 && <div className={box}><p className="text-sm text-muted">There are no open positions at the moment. Please check back soon.</p></div>}
      <div className="space-y-3">
        {data?.jobs.map((j) => (
          <div key={j.id} className={box}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-ink">{j.title}</h2>
                <p className="text-xs text-muted mt-0.5">{[j.location, j.employment_type, j.pay_range].filter(Boolean).join(' · ')}</p>
              </div>
              {!done[j.id] && openId !== j.id && <button className={btnCls} onClick={() => setOpenId(j.id)}>Apply</button>}
            </div>
            {done[j.id] && <p className="mt-3 text-sm text-green bg-greenTint rounded-md px-3 py-2">Thank you! We received your application and will be in touch.</p>}
            {openId === j.id && !done[j.id] && <ApplyForm job={j} onDone={() => setDone((d) => ({ ...d, [j.id]: true }))} />}
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function Approve() {
  const { token } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { api.publicApproval(token).then(setT).catch((e) => setError(e.message)); }, [token]);
  async function decide(decision) {
    setBusy(true); setError(null);
    try { await api.publicDecide(token, { decision, name, note }); setResult(decision); } catch (x) { setError(x.message); } finally { setBusy(false); }
  }
  const decided = result || t?.decision;
  return (
    <Shell title="Timesheet approval" sub="Review the hours and let us know">
      <div className={box}>
        {!t && !error && <p className="text-sm text-muted">Loading…</p>}
        {!t && error && <p className="text-sm text-muted">{error}</p>}
        {t && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Worker</dt><dd className="text-ink font-medium">{t.candidate}</dd>
              <dt className="text-muted">Role</dt><dd className="text-ink">{t.job}</dd>
              <dt className="text-muted">Client</dt><dd className="text-ink">{t.client}</dd>
              <dt className="text-muted">Period</dt><dd className="text-ink">{longDate(t.period_start)} – {longDate(t.period_end)}</dd>
              <dt className="text-muted">Hours</dt><dd className="text-ink font-semibold">{t.hours}</dd>
            </dl>
            {decided ? (
              <p className="mt-5 text-sm rounded-md px-3 py-2 bg-wash text-ink" data-testid="decided">
                {decided === 'approved' ? 'Approved — thank you. These hours were confirmed.' : 'Rejected — we will review these hours and get back to you.'}
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {error && <p className="text-sm text-rose bg-roseTint border border-rose/30 rounded-md px-3 py-2">{error}</p>}
                <input className={inputCls} placeholder="Your full name (acts as your signature)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your full name" />
                <textarea className={inputCls} rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
                <div className="flex flex-wrap gap-2">
                  <button className={btnCls} disabled={busy} onClick={() => decide('approved')}>Approve hours</button>
                  <button className="inline-flex items-center rounded-lg border border-line bg-surface text-ink text-sm font-semibold px-4 py-2 hover:bg-wash disabled:opacity-50" disabled={busy} onClick={() => decide('rejected')}>Reject</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
