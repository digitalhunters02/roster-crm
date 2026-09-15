import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, Table, Badge, CellName, Avatar, Spinner, Button, Modal, ConfirmDialog,
  Field, TextInput, TextArea, SelectInput, FormGrid, FormError, RowActions,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { downloadCsv } from '../csv.js';

const STATUS_TONE = { Active: 'green', Prospect: 'amber', Inactive: 'neutral' };
const STATUS_OPTIONS = ['Active', 'Prospect', 'Inactive'];

const EMPTY = {
  company_name: '', industry: '', contact_name: '', contact_email: '', contact_phone: '',
  address: '', owner_user_id: '', status: 'Prospect', notes: '',
};

function ClientForm({ initial, users, onCancel, onSubmit, saving, error }) {
  const [values, setValues] = useState(initial);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal
      title={initial.id ? 'Edit Client' : 'New Client'}
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? 'Saving…' : 'Save Client'}</Button>
        </>
      }
    >
      <FormError error={error} />
      <FormGrid>
        <Field label="Company name" required>
          <TextInput value={values.company_name} onChange={set('company_name')} placeholder="Northwind Analytics" />
        </Field>
        <Field label="Industry" required>
          <TextInput value={values.industry} onChange={set('industry')} placeholder="Data & Analytics SaaS" />
        </Field>
        <Field label="Contact name" required>
          <TextInput value={values.contact_name} onChange={set('contact_name')} placeholder="Grace Palmer" />
        </Field>
        <Field label="Contact email" required>
          <TextInput type="email" value={values.contact_email} onChange={set('contact_email')} placeholder="grace.palmer@northwindanalytics.com" />
        </Field>
        <Field label="Contact phone" required>
          <TextInput value={values.contact_phone} onChange={set('contact_phone')} placeholder="(512) 555-0118" />
        </Field>
        <Field label="Address" required>
          <TextInput value={values.address} onChange={set('address')} placeholder="400 Congress Ave, Austin, TX" />
        </Field>
        <Field label="Account owner" required>
          <SelectInput value={values.owner_user_id} onChange={set('owner_user_id')}>
            <option value="">Select owner…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Status" required>
          <SelectInput value={values.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectInput>
        </Field>
      </FormGrid>
      <Field label="Notes">
        <TextArea value={values.notes || ''} onChange={set('notes')} placeholder="Relationship notes, hiring patterns…" />
      </Field>
    </Modal>
  );
}

export default function Clients() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function load() {
    api.clients().then(setRows);
  }

  useEffect(() => {
    load();
    api.users().then(setUsers);
  }, []);

  if (!rows) return <Layout title="Clients"><Spinner /></Layout>;

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
        id: row.id, company_name: row.company_name, industry: row.industry, contact_name: row.contact_name,
        contact_email: row.contact_email, contact_phone: row.contact_phone, address: row.address,
        owner_user_id: row.owner_user_id, status: row.status, notes: row.notes || '',
      },
    });
  }

  async function handleSubmit(values) {
    setSaving(true);
    setFormError(null);
    try {
      if (modal.mode === 'create') {
        const created = await api.createClient(values);
        setRows((prev) => [...prev, created].sort((a, b) => a.company_name.localeCompare(b.company_name)));
      } else {
        const updated = await api.updateClient(modal.row.id, values);
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
      await api.deleteClient(deleteRow.id);
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
      'roster-clients.csv',
      ['Company', 'Industry', 'Contact', 'Email', 'Phone', 'Open Jobs', 'Placements', 'Owner', 'Status'],
      rows.map((r) => [r.company_name, r.industry, r.contact_name, r.contact_email, r.contact_phone, r.open_job_count, r.placement_count, r.owner_name, r.status])
    );
  }

  const cols = [
    { key: 'company_name', header: 'Client', render: (r) => <CellName primary={r.company_name} secondary={r.industry} /> },
    { key: 'contact_name', header: 'Contact', render: (r) => <span className="text-sm text-muted">{r.contact_name}</span> },
    { key: 'open_job_count', header: 'Open Jobs', render: (r) => r.open_job_count },
    { key: 'placement_count', header: 'Placements', render: (r) => r.placement_count },
    { key: 'owner_name', header: 'Owner', render: (r) => <Avatar name={r.owner_name} color={r.owner_color} size={24} /> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge> },
    {
      key: 'actions', header: '', className: 'w-20',
      render: (r) => <RowActions onEdit={() => openEdit(r)} onDelete={() => { setDeleteError(null); setDeleteRow(r); }} />,
    },
  ];

  return (
    <Layout
      title="Clients"
      count={rows.length}
      actions={
        <>
          <Button variant="outline" onClick={handleExport}><Icon name="download" size={15} /> Export</Button>
          <Button onClick={openCreate}><Icon name="plus" size={15} /> New Client</Button>
        </>
      }
    >
      <Card>
        <Table cols={cols} rows={rows} />
      </Card>

      {modal && (
        <ClientForm
          initial={modal.initial}
          users={users}
          onCancel={() => setModal(null)}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
        />
      )}

      {deleteRow && (
        <ConfirmDialog
          title="Delete client?"
          message={`This will permanently remove ${deleteRow.company_name}.`}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
