import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, Table, Badge, CellName, Spinner, Button, Modal, ConfirmDialog,
  Field, TextInput, TextArea, SelectInput, FormGrid, FormError, RowActions,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { shortDateTime } from '../format.js';
import { downloadCsv } from '../csv.js';

const STATUS_TONE = { Scheduled: 'blue', Completed: 'green', 'No-show': 'rose', Cancelled: 'neutral' };
const STATUS_OPTIONS = ['Scheduled', 'Completed', 'No-show', 'Cancelled'];
const TYPE_OPTIONS = ['Phone Screen', 'Client Interview', 'Final Round'];

const EMPTY = { submission_id: '', interviewer_name: '', scheduled_at: '', type: 'Phone Screen', status: 'Scheduled', notes: '' };

function InterviewForm({ initial, submissions, onCancel, onSubmit, saving, error }) {
  const [values, setValues] = useState(initial);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal
      title={initial.id ? 'Edit Interview' : 'New Interview'}
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? 'Saving…' : 'Save Interview'}</Button>
        </>
      }
    >
      <FormError error={error} />
      <FormGrid>
        <Field label="Submission" required hint="Candidate × job this interview is for">
          <SelectInput value={values.submission_id} onChange={set('submission_id')}>
            <option value="">Select submission…</option>
            {submissions.map((s) => <option key={s.id} value={s.id}>{s.candidate_name} — {s.job_title}</option>)}
          </SelectInput>
        </Field>
        <Field label="Interviewer" required>
          <TextInput value={values.interviewer_name} onChange={set('interviewer_name')} placeholder="Grace Palmer" />
        </Field>
        <Field label="Scheduled at" required>
          <TextInput type="datetime-local" value={values.scheduled_at} onChange={set('scheduled_at')} />
        </Field>
        <Field label="Type" required>
          <SelectInput value={values.type} onChange={set('type')}>
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectInput>
        </Field>
        <Field label="Status" required>
          <SelectInput value={values.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectInput>
        </Field>
      </FormGrid>
      <Field label="Notes">
        <TextArea value={values.notes || ''} onChange={set('notes')} placeholder="Prep notes, feedback…" />
      </Field>
    </Modal>
  );
}

export default function Interviews() {
  const [rows, setRows] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function load() {
    api.interviews().then(setRows);
  }

  useEffect(() => {
    load();
    api.submissions().then(setSubmissions);
  }, []);

  if (!rows) return <Layout title="Interviews"><Spinner /></Layout>;

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
        id: row.id, submission_id: row.submission_id, interviewer_name: row.interviewer_name,
        scheduled_at: row.scheduled_at, type: row.type, status: row.status, notes: row.notes || '',
      },
    });
  }

  async function handleSubmit(values) {
    setSaving(true);
    setFormError(null);
    try {
      if (modal.mode === 'create') {
        const created = await api.createInterview(values);
        setRows((prev) => [created, ...prev]);
      } else {
        const updated = await api.updateInterview(modal.row.id, values);
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
      await api.deleteInterview(deleteRow.id);
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
      'roster-interviews.csv',
      ['Candidate', 'Job', 'Client', 'Interviewer', 'Scheduled', 'Type', 'Status'],
      rows.map((r) => [r.candidate_name, r.job_title, r.client_name, r.interviewer_name, r.scheduled_at, r.type, r.status])
    );
  }

  const cols = [
    { key: 'candidate_name', header: 'Candidate', render: (r) => <CellName primary={r.candidate_name} secondary={`${r.job_title} · ${r.client_name}`} /> },
    { key: 'interviewer_name', header: 'Interviewer', render: (r) => <span className="text-sm text-muted">{r.interviewer_name}</span> },
    { key: 'scheduled_at', header: 'Scheduled', render: (r) => shortDateTime(r.scheduled_at) },
    { key: 'type', header: 'Type', render: (r) => <span className="text-sm text-muted">{r.type}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge> },
    {
      key: 'actions', header: '', className: 'w-20',
      render: (r) => <RowActions onEdit={() => openEdit(r)} onDelete={() => { setDeleteError(null); setDeleteRow(r); }} />,
    },
  ];

  return (
    <Layout
      title="Interviews"
      count={rows.length}
      actions={
        <>
          <Button variant="outline" onClick={handleExport}><Icon name="download" size={15} /> Export</Button>
          <Button onClick={openCreate}><Icon name="plus" size={15} /> New Interview</Button>
        </>
      }
    >
      <Card>
        <Table cols={cols} rows={rows} />
      </Card>

      {modal && (
        <InterviewForm
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
          title="Delete interview?"
          message={`This will remove the ${deleteRow.type} for ${deleteRow.candidate_name}.`}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
