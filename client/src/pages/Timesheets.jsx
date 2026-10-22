import { useEffect, useState } from 'react';
import api, { downloadAuthed } from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, Table, Badge, CellName, Spinner, Button, Modal, ConfirmDialog, IconButton, Kpi,
  Field, TextInput, SelectInput, FormGrid, FormError, RowActions,
} from '../components/ui.jsx';
import InvoiceView from '../components/InvoiceView.jsx';
import Icon from '../components/Icon.jsx';
import { money, shortDate } from '../format.js';
import { downloadCsv } from '../csv.js';

import { useT } from '../auth/i18n.js';
import { useFeatureGate } from '../billing/UpgradeNotice.jsx';
import { GateButton } from '../plans/GateButton.jsx';
const STATUS_TONE = { Draft: 'neutral', Sent: 'blue', Paid: 'green', Overdue: 'rose' };
const STATUS_OPTIONS = ['Draft', 'Sent', 'Paid', 'Overdue'];

const EMPTY = { placement_id: '', period_start: '', period_end: '', hours: '', amount: '', status: 'Draft' };

// Hours and gross pay (hours x pay rate) as a CSV for the payroll provider. Numbers only: Roster does not compute taxes.
function PayrollExport({ onClose }) {
  const { t } = useT();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setError(null);
    try { await downloadAuthed(`/timesheets/payroll-export?${new URLSearchParams({ ...(from && { from }), ...(to && { to }) })}`, 'roster-payroll-hours.csv'); onClose(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={t('Payroll hours export')} sub={t('One row per timesheet: worker, hours, pay rate and gross pay (hours x rate).')} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>{t('Cancel')}</Button><Button onClick={go} disabled={busy} data-testid="payroll-download">{busy ? t('Preparing…') : t('Download CSV')}</Button></>}>
      <FormError error={error} />
      <FormGrid>
        <Field label={t('Periods ending from')}><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="payroll-from" /></Field>
        <Field label={t('to')}><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </FormGrid>
      <p className="text-xs text-faint mt-1">{t('Drafts are left out. Roster only lists the numbers you entered: it does not calculate taxes, withholdings or overtime rules.')}</p>
    </Modal>
  );
}

function TimesheetForm({ initial, placements, onCancel, onSubmit, saving, error }) {
  const { t } = useT();
  const [values, setValues] = useState(initial);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  function onPlacementChange(e) {
    const placement_id = e.target.value;
    const p = placements.find((x) => String(x.id) === placement_id);
    setValues((v) => ({ ...v, placement_id, amount: v.amount || (p && v.hours ? Math.round(p.bill_rate * v.hours * 100) / 100 : v.amount) }));
  }

  return (
    <Modal
      title={initial.id ? t('Edit Timesheet / Invoice') : t('New Timesheet / Invoice')}
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>{t('Cancel')}</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? t('Saving…') : t('Save')}</Button>
        </>
      }
    >
      <FormError error={error} />
      <FormGrid>
        <Field label={t('Placement')} required>
          <SelectInput value={values.placement_id} onChange={onPlacementChange}>
            <option value="">{t('Select placement…')}</option>
            {placements.map((p) => <option key={p.id} value={p.id}>{p.candidate_name} — {p.client_name}</option>)}
          </SelectInput>
        </Field>
        <Field label={t('Status')} required>
          <SelectInput value={values.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t(s)}</option>)}
          </SelectInput>
        </Field>
        <Field label={t('Period start')} required>
          <TextInput type="date" value={values.period_start} onChange={set('period_start')} />
        </Field>
        <Field label={t('Period end')} required>
          <TextInput type="date" value={values.period_end} onChange={set('period_end')} />
        </Field>
        <Field label={t('Hours')} required>
          <TextInput type="number" min="0" step="0.5" value={values.hours} onChange={set('hours')} placeholder="80" />
        </Field>
        <Field label={t('Amount')} hint={t('Leave blank to use hours x the bill rate.')}>
          <TextInput type="number" min="0" step="0.01" value={values.amount} onChange={set('amount')} placeholder="7600" />
        </Field>
      </FormGrid>
    </Modal>
  );
}

// Margin per client (billed - what the staff were paid) and a CSV of hours + margin. The CSV is part of the payroll export (Complete).
function MarginCard() {
  const { t } = useT();
  const [m, setM] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.timesheetsMargin().then(setM).catch((e) => setErr(e.message)); }, []);
  async function download() {
    setErr(null);
    try { await downloadAuthed('/timesheets/export', 'roster-hours.csv'); } catch (e) { setErr(e.message); }
  }
  if (!m) return err ? <p className="text-sm text-rose mb-4">{err}</p> : null;
  const tot = m.totals;
  return (
    <Card className="p-4 mb-4" data-testid="margin-card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm font-semibold text-ink">{t('Margin per client')}</div>
        <GateButton gate="payroll" variant="outline" size="sm" onClick={download} data-testid="margin-csv"><Icon name="download" size={14} /> {t('Hours + margin (CSV)')}</GateButton>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] text-muted"><th className="py-1 pr-3">{t('Client')}</th><th className="pr-3">{t('Hours')}</th><th className="pr-3">{t('Billed')}</th><th className="pr-3">{t('Paid to workers')}</th><th className="pr-3">{t('Margin')}</th></tr></thead>
          <tbody>{m.byClient.map((c) => (
            <tr key={c.client} className="border-t border-line"><td className="py-1.5 pr-3 text-ink">{c.client}</td><td className="pr-3">{c.hours}</td><td className="pr-3">{money(c.billed)}</td><td className="pr-3">{money(c.cost)}</td><td className="pr-3 font-medium">{money(c.margin)}</td></tr>
          ))}
          {m.byClient.length > 1 && <tr className="border-t border-line font-semibold"><td className="py-1.5 pr-3 text-ink">{t('Total')}</td><td className="pr-3">{tot.hours}</td><td className="pr-3">{money(tot.billed)}</td><td className="pr-3">{money(tot.cost)}</td><td className="pr-3">{money(tot.margin)} ({tot.margin_pct}%)</td></tr>}
          </tbody>
        </table>
      </div>
      {err && <p className="text-xs text-rose mt-2">{err}</p>}
    </Card>
  );
}

// A link the client opens without a login to approve or reject one timesheet. Same answer the client portal shows (Client approved / disputed).
function ApprovalLinkModal({ row, onClose }) {
  const { t } = useT();
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { api.timesheetApprovalLink(row.id).then((r) => setUrl(r.url)).catch((e) => setErr(e.message)); }, [row.id]);
  const copy = () => { navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => {}); };
  return (
    <Modal title={t('Client approval link')} sub={`${row.candidate_name} · ${row.client_name}`} onClose={onClose}
      footer={<Button variant="outline" onClick={onClose}>{t('Close')}</Button>}>
      <FormError error={err} />
      {!url && !err && <Spinner />}
      {url && (
        <>
          <p className="text-sm text-muted mb-2">{t('Send this link to the client. They review the hours and approve or reject, with no login. Creating a new link cancels the old one.')}</p>
          <input readOnly value={url} onFocus={(e) => e.target.select()} className="w-full rounded-lg border border-line bg-wash px-3 py-2 text-xs text-ink" aria-label={t('Approval link')} data-testid="approval-url" />
          <div className="mt-3"><Button variant="brand" size="sm" onClick={copy}>{copied ? t('Copied') : t('Copy link')}</Button></div>
        </>
      )}
    </Modal>
  );
}

function TimesheetsInner() {
  const { t } = useT();
  const [rows, setRows] = useState(null);
  const [placements, setPlacements] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [invoiceFor, setInvoiceFor] = useState(null);
  const [sendRow, setSendRow] = useState(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [linkRow, setLinkRow] = useState(null);

  function load() {
    api.timesheets().then(setRows);
  }

  useEffect(() => {
    load();
    api.placements().then(setPlacements);
  }, []);

  if (!rows) return <Layout title={t('Timesheets & Invoicing')}><Spinner /></Layout>;

  function openCreate() {
    setFormError(null);
    setModal({ mode: 'create', initial: EMPTY });
  }
  function openEdit(row) {
    setFormError(null);
    setModal({
      mode: 'edit',
      row,
      initial: {
        id: row.id, placement_id: row.placement_id, period_start: row.period_start, period_end: row.period_end,
        hours: row.hours, amount: row.amount, status: row.status,
      },
    });
  }

  async function handleSubmit(values) {
    setSaving(true);
    setFormError(null);
    try {
      if (modal.mode === 'create') {
        const created = await api.createTimesheet(values);
        setRows((prev) => [created, ...prev]);
      } else {
        const updated = await api.updateTimesheet(modal.row.id, values);
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
      setModal(null);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteTimesheet(deleteRow.id);
      setRows((prev) => prev.filter((r) => r.id !== deleteRow.id));
      setDeleteRow(null);
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleSend() {
    setSendBusy(true);
    setSendError(null);
    try {
      const updated = await api.sendInvoice(sendRow.id);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setSendRow(null);
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSendBusy(false);
    }
  }

  function handleExport() {
    downloadCsv(
      'roster-timesheets.csv',
      [t('Candidate'), t('Client'), t('Period Start'), t('Period End'), t('Hours'), t('Amount'), t('Cost'), t('Margin'), t('Status')],
      rows.map((r) => [r.candidate_name, r.client_name, r.period_start, r.period_end, r.hours, r.amount, r.cost, r.margin, r.status])
    );
  }

  const billed = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const cost = rows.reduce((a, r) => a + (Number(r.cost) || 0), 0);

  const cols = [
    { key: 'candidate_name', header: t('Candidate'), render: (r) => <CellName primary={r.candidate_name} secondary={`${r.client_name} · ${r.job_title}`} /> },
    { key: 'period', header: t('Period'), render: (r) => <span className="text-sm text-muted">{shortDate(r.period_start)} – {shortDate(r.period_end)}</span> },
    { key: 'hours', header: t('Hours'), render: (r) => r.hours },
    { key: 'amount', header: t('Amount'), render: (r) => <span className="font-medium">{money(r.amount)}</span> },
    { key: 'margin', header: t('Margin'), render: (r) => <span className={`text-sm font-medium ${r.margin < 0 ? 'text-rose' : 'text-green'}`} title={`${t('Cost')}: ${money(r.cost)}`}>{money(r.margin)}</span> },
    {
      key: 'status', header: t('Status'),
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge>
          {r.client_approved_at && <Badge tone="green">{t('Client approved')}</Badge>}
          {!r.client_approved_at && r.client_dispute_note && <span title={r.client_dispute_note}><Badge tone="rose">{t('Client disputed')}</Badge></span>}
        </div>
      ),
    },
    {
      key: 'actions', header: '', className: 'w-44',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton icon="receipt" title={t('View invoice')} onClick={() => setInvoiceFor(r)} />
          <IconButton icon="mail" title={t('Send invoice to client')} onClick={() => { setSendError(null); setSendRow(r); }} />
          <IconButton icon="arrowUpRight" title={r.approval_decision ? t('New approval link') : t('Client approval link')} onClick={() => setLinkRow(r)} />
          <RowActions onEdit={() => openEdit(r)} onDelete={() => { setDeleteError(null); setDeleteRow(r); }} />
        </div>
      ),
    },
  ];

  return (
    <Layout
      title={t('Timesheets & Invoicing')}
      count={rows.length}
      actions={
        <>
          <GateButton gate="payroll" variant="outline" onClick={() => setPayrollOpen(true)} data-testid="payroll-open"><Icon name="download" size={15} /> {t('Payroll hours')}</GateButton>
          <Button variant="outline" onClick={handleExport}><Icon name="download" size={15} /> {t('Export')}</Button>
          <Button onClick={openCreate}><Icon name="plus" size={15} /> {t('New Timesheet')}</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" data-testid="timesheet-kpis">
        <Kpi label={t('Billed')} value={money(billed)} />
        <Kpi label={t('Paid to workers')} value={money(cost)} />
        <Kpi label={t('Margin')} value={money(billed - cost)} />
        <Kpi label={t('Margin %')} value={billed ? `${Math.round(((billed - cost) / billed) * 100)}%` : '-'} />
      </div>
      <MarginCard key={rows.map((r) => `${r.id}:${r.hours}:${r.amount}`).join('|')} />
      <Card>
        <Table cols={cols} rows={rows} />
      </Card>

      {modal && (
        <TimesheetForm
          initial={modal.initial}
          placements={placements}
          onCancel={() => setModal(null)}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
        />
      )}

      {linkRow && <ApprovalLinkModal row={linkRow} onClose={() => { setLinkRow(null); load(); }} />}
      {payrollOpen && <PayrollExport onClose={() => setPayrollOpen(false)} />}
      {invoiceFor && <InvoiceView load={() => api.timesheetInvoice(invoiceFor.id)} onClose={() => setInvoiceFor(null)} />}

      {sendRow && (
        <Modal
          title={t('Send invoice to client?')}
          onClose={() => setSendRow(null)}
          footer={
            <>
              <Button variant="outline" onClick={() => setSendRow(null)} disabled={sendBusy}>{t('Cancel')}</Button>
              <Button onClick={handleSend} disabled={sendBusy} data-testid="send-invoice-confirm">{sendBusy ? t('Sending…') : t('Send')}</Button>
            </>
          }
        >
          <p className="text-sm text-muted">{t('We will e-mail the invoice to the contact at {name}, with their private portal link. A draft becomes Sent.', { name: sendRow.client_name })}</p>
          <p className="text-xs text-faint mt-2">{t('The client portal must be turned on for this client (Clients page).')}</p>
          <FormError error={sendError} />
        </Modal>
      )}

      {deleteRow && (
        <ConfirmDialog
          title={t('Delete timesheet?')}
          message={t('This will remove the {from} – {to} timesheet for {name}.', { from: shortDate(deleteRow.period_start), to: shortDate(deleteRow.period_end), name: deleteRow.candidate_name })}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}

// The plan decides whether this area is open (Essential and up); the server also answers 402 to its API calls.
export default function Timesheets() {
  const { t } = useT();
  const locked = useFeatureGate('timesheets', t('Timesheets & Invoicing'));
  return locked || <TimesheetsInner />;
}
