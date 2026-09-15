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

const STATUS_TONE = { Active: 'green', Completed: 'blue', 'Ended Early': 'rose' };
const STATUS_OPTIONS = ['Active', 'Completed', 'Ended Early'];

const EMPTY = {
  submission_id: '', candidate_id: '', client_id: '', job_id: '', start_date: '', end_date: '',
  pay_rate: '', bill_rate: '', placement_fee: '', status: 'Active',
};

function PlacementForm({ initial, submissions, onCancel, onSubmit, saving, error }) {
  const [values, setValues] = useState(initial);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  function onSubmissionChange(e) {
    const submission_id = e.target.value;
    const s = submissions.find((x) => String(x.id) === submission_id);
    setValues((v) => ({
      ...v, submission_id,
      candidate_id: s ? s.candidate_id : v.candidate_id,
      job_id: s ? s.job_id : v.job_id,
      client_id: s ? s.client_id : v.client_id,
    }));
  }

  return (
    <Modal
      title={initial.id ? 'Edit Placement' : 'New Placement'}
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? 'Saving…' : 'Save Placement'}</Button>
        </>
      }
    >
      <FormError error={error} />
      <FormGrid>
        <Field label="Submission" required hint="Candidate × job being placed">
          <SelectInput value={values.submission_id} onChange={onSubmissionChange}>
            <option value="">Select submission…</option>
            {submissions.map((s) => <option key={s.id} value={s.id}>{s.candidate_name} — {s.job_title} ({s.client_name})</option>)}
          </SelectInput>
        </Field>
        <Field label="Status" required>
          <SelectInput value={values.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectInput>
        </Field>
        <Field label="Start date" required>
          <TextInput type="date" value={values.start_date} onChange={set('start_date')} />
        </Field>
        <Field label="End date" hint="Leave blank for permanent / ongoing">
          <TextInput type="date" value={values.end_date || ''} onChange={set('end_date')} />
        </Field>
        <Field label="Pay rate" required hint="Hourly rate, or annual salary for permanent">
          <TextInput type="number" min="0" step="0.01" value={values.pay_rate} onChange={set('pay_rate')} placeholder="140000" />
        </Field>
        <Field label="Bill rate" required hint="Hourly rate billed to client (0 for permanent)">
          <TextInput type="number" min="0" step="0.01" value={values.bill_rate} onChange={set('bill_rate')} placeholder="95" />
        </Field>
        <Field label="Placement fee" required>
          <TextInput type="number" min="0" step="0.01" value={values.placement_fee} onChange={set('placement_fee')} placeholder="28000" />
        </Field>
      </FormGrid>
    </Modal>
  );
}

export default function Placements() {
  const [rows, setRows] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function load() {
    api.placements().then(setRows);
  }

  useEffect(() => {
    load();
    api.submissions().then(setSubmissions);
  }, []);

  if (!rows) return <Layout title="Placements"><Spinner /></Layout>;

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
        id: row.id, submission_id: row.submission_id, candidate_id: row.candidate_id, client_id: row.client_id,
        job_id: row.job_id, start_date: row.start_date, end_date: row.end_date || '', pay_rate: row.pay_rate,
        bill_rate: row.bill_rate, placement_fee: row.placement_fee, status: row.status,
      },
    });
  }

  async function handleSubmit(values) {
    setSaving(true);
    setFormError(null);
    try {
      if (modal.mode === 'create') {
        const created = await api.createPlacement(values);
        setRows((prev) => [created, ...prev]);
      } else {
        const updated = await api.updatePlacement(modal.row.id, values);
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
      await api.deletePlacement(deleteRow.id);
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
      'roster-placements.csv',
      ['Candidate', 'Client', 'Job', 'Start', 'End', 'Pay Rate', 'Bill Rate', 'Fee', 'Status'],
      rows.map((r) => [r.candidate_name, r.client_name, r.job_title, r.start_date, r.end_date || '', r.pay_rate, r.bill_rate, r.placement_fee, r.status])
    );
  }

  const cols = [
    { key: 'candidate_name', header: 'Candidate', render: (r) => <CellName primary={r.candidate_name} secondary={`${r.job_title} · ${r.client_name}`} /> },
    { key: 'start_date', header: 'Start', render: (r) => shortDate(r.start_date) },
    { key: 'end_date', header: 'End', render: (r) => (r.end_date ? shortDate(r.end_date) : '—') },
    { key: 'pay_rate', header: 'Pay Rate', render: (r) => (r.job_employment_type === 'Permanent' ? money(r.pay_rate, true) : `$${r.pay_rate}/hr`) },
    { key: 'placement_fee', header: 'Fee', render: (r) => <span className="font-medium">{money(r.placement_fee)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge> },
    {
      key: 'actions', header: '', className: 'w-20',
      render: (r) => <RowActions onEdit={() => openEdit(r)} onDelete={() => { setDeleteError(null); setDeleteRow(r); }} />,
    },
  ];

  return (
    <Layout
      title="Placements"
      count={rows.length}
      actions={
        <>
          <Button variant="outline" onClick={handleExport}><Icon name="download" size={15} /> Export</Button>
          <Button onClick={openCreate}><Icon name="plus" size={15} /> New Placement</Button>
        </>
      }
    >
      <Card>
        <Table cols={cols} rows={rows} />
      </Card>

      {modal && (
        <PlacementForm
          initial={modal.initial}
          submissions={submissions}
          onCancel={() => setModal(null)}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
        />
      )}

      {deleteRow && (
        <ConfirmDialog
          title="Delete placement?"
          message={`This will permanently remove the placement for ${deleteRow.candidate_name}.`}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
