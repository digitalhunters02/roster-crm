import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, Table, Badge, CellName, Spinner, Button, Modal, ConfirmDialog,
  Field, TextInput, TextArea, SelectInput, FormGrid, FormError, RowActions,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { shortDate } from '../format.js';
import { downloadCsv } from '../csv.js';

const STATUS_TONE = { Open: 'green', 'On Hold': 'amber', Filled: 'blue', Cancelled: 'neutral' };
const STATUS_OPTIONS = ['Open', 'On Hold', 'Filled', 'Cancelled'];
const TYPE_OPTIONS = ['Contract', 'Permanent', 'Contract-to-Hire'];

const EMPTY = {
  client_id: '', title: '', employment_type: 'Permanent', pay_range: '', location: '',
  status: 'Open', owner_user_id: '', opened_date: '', notes: '',
};

function JobForm({ initial, clients, users, onCancel, onSubmit, saving, error }) {
  const [values, setValues] = useState(initial);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal
      title={initial.id ? 'Edit Job' : 'New Job'}
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? 'Saving…' : 'Save Job'}</Button>
        </>
      }
    >
      <FormError error={error} />
      <FormGrid>
        <Field label="Client" required>
          <SelectInput value={values.client_id} onChange={set('client_id')}>
            <option value="">Select client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Job title" required>
          <TextInput value={values.title} onChange={set('title')} placeholder="Senior Backend Engineer" />
        </Field>
        <Field label="Employment type" required>
          <SelectInput value={values.employment_type} onChange={set('employment_type')}>
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectInput>
        </Field>
        <Field label="Pay range" required hint="Salary or bill rate as shown to candidates/clients">
          <TextInput value={values.pay_range} onChange={set('pay_range')} placeholder="$130,000 – $150,000" />
        </Field>
        <Field label="Location" required>
          <TextInput value={values.location} onChange={set('location')} placeholder="Austin, TX" />
        </Field>
        <Field label="Status" required>
          <SelectInput value={values.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectInput>
        </Field>
        <Field label="Owner" required>
          <SelectInput value={values.owner_user_id} onChange={set('owner_user_id')}>
            <option value="">Select owner…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Opened date" required>
          <TextInput type="date" value={values.opened_date} onChange={set('opened_date')} />
        </Field>
      </FormGrid>
      <Field label="Notes">
        <TextArea value={values.notes || ''} onChange={set('notes')} placeholder="Intake notes, must-haves, client quirks…" />
      </Field>
    </Modal>
  );
}

export default function Jobs() {
  const [rows, setRows] = useState(null);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function load() {
    api.jobs().then(setRows);
  }

  useEffect(() => {
    load();
    api.clients().then(setClients);
    api.users().then(setUsers);
  }, []);

  if (!rows) return <Layout title="Jobs"><Spinner /></Layout>;

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
        id: row.id, client_id: row.client_id, title: row.title, employment_type: row.employment_type,
        pay_range: row.pay_range, location: row.location, status: row.status, owner_user_id: row.owner_user_id,
        opened_date: row.opened_date, notes: row.notes || '',
      },
    });
  }

  async function handleSubmit(values) {
    setSaving(true);
    setFormError(null);
    try {
      if (modal.mode === 'create') {
        const created = await api.createJob(values);
        setRows((prev) => [created, ...prev]);
      } else {
        const updated = await api.updateJob(modal.row.id, values);
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
      await api.deleteJob(deleteRow.id);
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
      'roster-jobs.csv',
      ['Title', 'Client', 'Type', 'Pay Range', 'Location', 'Status', 'Owner', 'Opened', 'Submissions'],
      rows.map((r) => [r.title, r.client_name, r.employment_type, r.pay_range, r.location, r.status, r.owner_name, r.opened_date, r.submission_count])
    );
  }

  const cols = [
    { key: 'title', header: 'Job', render: (r) => <CellName primary={r.title} secondary={r.client_name} /> },
    { key: 'employment_type', header: 'Type', render: (r) => <span className="text-sm text-muted">{r.employment_type}</span> },
    { key: 'pay_range', header: 'Pay Range', render: (r) => <span className="text-sm text-ink font-medium">{r.pay_range}</span> },
    { key: 'location', header: 'Location', render: (r) => <span className="text-sm text-muted">{r.location}</span> },
    { key: 'submission_count', header: 'Submissions', render: (r) => r.submission_count },
    { key: 'owner_name', header: 'Owner', render: (r) => <span className="text-sm text-muted">{r.owner_name}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge> },
    {
      key: 'actions', header: '', className: 'w-20',
      render: (r) => <RowActions onEdit={() => openEdit(r)} onDelete={() => { setDeleteError(null); setDeleteRow(r); }} />,
    },
  ];

  return (
    <Layout
      title="Jobs"
      count={rows.length}
      actions={
        <>
          <Button variant="outline" onClick={handleExport}><Icon name="download" size={15} /> Export</Button>
          <Button onClick={openCreate}><Icon name="plus" size={15} /> New Job</Button>
        </>
      }
    >
      <Card>
        <Table cols={cols} rows={rows} />
      </Card>

      {modal && (
        <JobForm
          initial={modal.initial}
          clients={clients}
          users={users}
          onCancel={() => setModal(null)}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
        />
      )}

      {deleteRow && (
        <ConfirmDialog
          title="Delete job?"
          message={`This will permanently remove ${deleteRow.title} at ${deleteRow.client_name}.`}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
