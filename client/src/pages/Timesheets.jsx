import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, Table, Badge, CellName, Spinner, Button, Modal, ConfirmDialog,
  Field, TextInput, SelectInput, FormGrid, FormError, RowActions,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { money, shortDate } from '../format.js';
import { downloadCsv } from '../csv.js';
import { usePlan } from '../plans/PlanContext.jsx';
import { LockIcon } from '../plans/PlanGate.jsx';
import { Link } from 'react-router-dom';

const STATUS_TONE = { Draft: 'neutral', Sent: 'blue', Paid: 'green', Overdue: 'rose' };
const STATUS_OPTIONS = ['Draft', 'Sent', 'Paid', 'Overdue'];

const EMPTY = { placement_id: '', period_start: '', period_end: '', hours: '', amount: '', status: 'Draft' };

function TimesheetForm({ initial, placements, onCancel, onSubmit, saving, error }) {
  const [values, setValues] = useState(initial);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  function onPlacementChange(e) {
    const placement_id = e.target.value;
    const p = placements.find((x) => String(x.id) === placement_id);
    setValues((v) => ({ ...v, placement_id, amount: v.amount || (p && v.hours ? Math.round(p.bill_rate * v.hours * 100) / 100 : v.amount) }));
  }

  return (
    <Modal
      title={initial.id ? 'Edit Timesheet / Invoice' : 'New Timesheet / Invoice'}
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <FormError error={error} />
      <FormGrid>
        <Field label="Placement" required>
          <SelectInput value={values.placement_id} onChange={onPlacementChange}>
            <option value="">Select placement…</option>
            {placements.map((p) => <option key={p.id} value={p.id}>{p.candidate_name} — {p.client_name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Status" required>
          <SelectInput value={values.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectInput>
        </Field>
        <Field label="Period start" required>
          <TextInput type="date" value={values.period_start} onChange={set('period_start')} />
        </Field>
        <Field label="Period end" required>
          <TextInput type="date" value={values.period_end} onChange={set('period_end')} />
        </Field>
        <Field label="Hours" required>
          <TextInput type="number" min="0" step="0.5" value={values.hours} onChange={set('hours')} placeholder="80" />
        </Field>
        <Field label="Amount" required>
          <TextInput type="number" min="0" step="0.01" value={values.amount} onChange={set('amount')} placeholder="7600" />
        </Field>
      </FormGrid>
    </Modal>
  );
}

function MarginCard() {
  const { allows } = usePlan();
  const [m, setM] = useState(null);
  const [err, setErr] = useState(null);
  const on = allows('margin');
  useEffect(() => { if (on) api.timesheetsMargin().then(setM).catch((e) => setErr(e.message)); }, [on]);
  async function download() {
    try {
      const blob = await api.timesheetsExportBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'roster-hours.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
  }
  if (!on) {
    return (
      <Card className="p-4 mb-4 flex flex-wrap items-center gap-3" data-testid="margin-locked">
        <span className="w-9 h-9 rounded-full bg-brandTint text-brand flex items-center justify-center"><LockIcon size={16} /></span>
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm font-semibold text-ink">Margin per client, hours export and client approval link</div>
          <div className="text-xs text-muted">See what you earn on every hour worked and let clients approve hours online. Included in the Complete plan.</div>
        </div>
        <Link to="/settings" className="text-sm font-semibold text-brand hover:underline">See plans</Link>
      </Card>
    );
  }
  if (!m) return err ? <p className="text-sm text-rose mb-4">{err}</p> : null;
  const t = m.totals;
  return (
    <Card className="p-4 mb-4" data-testid="margin-card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm font-semibold text-ink">Margin per client</div>
        <Button variant="outline" size="sm" onClick={download}><Icon name="download" size={14} /> Hours + margin (CSV)</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {[['Billed', money(t.billed)], ['Paid to staff', money(t.cost)], ['Margin', money(t.margin)], ['Margin %', `${t.margin_pct}%`]].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-wash px-3 py-2"><div className="text-[11px] text-muted">{k}</div><div className="text-base font-semibold text-ink">{v}</div></div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] text-muted"><th className="py-1 pr-3">Client</th><th className="pr-3">Hours</th><th className="pr-3">Billed</th><th className="pr-3">Margin</th></tr></thead>
          <tbody>{m.byClient.map((c) => (
            <tr key={c.client} className="border-t border-line"><td className="py-1.5 pr-3 text-ink">{c.client}</td><td className="pr-3">{c.hours}</td><td className="pr-3">{money(c.billed)}</td><td className="pr-3 font-medium">{money(c.margin)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {err && <p className="text-xs text-rose mt-2">{err}</p>}
    </Card>
  );
}

function ApprovalLinkModal({ row, onClose }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { api.timesheetApprovalLink(row.id).then((r) => setUrl(r.url)).catch((e) => setErr(e.message)); }, [row.id]);
  const copy = () => { navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => {}); };
  return (
    <Modal title="Client approval link" sub={`${row.candidate_name} · ${row.client_name}`} onClose={onClose}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <FormError error={err} />
      {!url && !err && <Spinner />}
      {url && (
        <>
          <p className="text-sm text-muted mb-2">Send this link to the client. They review the hours and approve or reject — no login needed. Creating a new link cancels the old one.</p>
          <input readOnly value={url} onFocus={(e) => e.target.select()} className="w-full rounded-lg border border-line bg-wash px-3 py-2 text-xs text-ink" aria-label="Approval link" />
          <div className="mt-3"><Button variant="brand" size="sm" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button></div>
        </>
      )}
    </Modal>
  );
}

export default function Timesheets() {
  const { allows } = usePlan();
  const [linkRow, setLinkRow] = useState(null);
  const [rows, setRows] = useState(null);
  const [placements, setPlacements] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function load() {
    api.timesheets().then(setRows);
  }

  useEffect(() => {
    load();
    api.placements().then(setPlacements);
  }, []);

  if (!rows) return <Layout title="Timesheets & Invoicing"><Spinner /></Layout>;

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

  function handleExport() {
    downloadCsv(
      'roster-timesheets.csv',
      ['Candidate', 'Client', 'Period Start', 'Period End', 'Hours', 'Amount', 'Status'],
      rows.map((r) => [r.candidate_name, r.client_name, r.period_start, r.period_end, r.hours, r.amount, r.status])
    );
  }

  const cols = [
    { key: 'candidate_name', header: 'Candidate', render: (r) => <CellName primary={r.candidate_name} secondary={`${r.client_name} · ${r.job_title}`} /> },
    { key: 'period', header: 'Period', render: (r) => <span className="text-sm text-muted">{shortDate(r.period_start)} – {shortDate(r.period_end)}</span> },
    { key: 'hours', header: 'Hours', render: (r) => r.hours },
    { key: 'amount', header: 'Amount', render: (r) => <span className="font-medium">{money(r.amount)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge> },
    ...(allows('hours_portal') ? [{
      key: 'approval', header: 'Client',
      render: (r) => (
        <div className="flex items-center gap-2">
          {r.approval_decision && <Badge tone={r.approval_decision === 'approved' ? 'green' : 'rose'}>{r.approval_decision === 'approved' ? 'Approved' : 'Rejected'}</Badge>}
          <Button variant="ghost" size="sm" onClick={() => setLinkRow(r)}>{r.approval_decision ? 'New link' : 'Approval link'}</Button>
        </div>
      ),
    }] : []),
    {
      key: 'actions', header: '', className: 'w-20',
      render: (r) => <RowActions onEdit={() => openEdit(r)} onDelete={() => { setDeleteError(null); setDeleteRow(r); }} />,
    },
  ];

  return (
    <Layout
      title="Timesheets & Invoicing"
      count={rows.length}
      actions={
        <>
          <Button variant="outline" onClick={handleExport}><Icon name="download" size={15} /> Export</Button>
          <Button onClick={openCreate}><Icon name="plus" size={15} /> New Timesheet</Button>
        </>
      }
    >
      <MarginCard />
      <Card>
        <Table cols={cols} rows={rows} />
      </Card>
      {linkRow && <ApprovalLinkModal row={linkRow} onClose={() => { setLinkRow(null); load(); }} />}

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

      {deleteRow && (
        <ConfirmDialog
          title="Delete timesheet?"
          message={`This will remove the ${shortDate(deleteRow.period_start)} – ${shortDate(deleteRow.period_end)} timesheet for ${deleteRow.candidate_name}.`}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
