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

const SOURCE_TONE = { LinkedIn: 'blue', Referral: 'green', 'Job Board': 'amber', Sourced: 'brand' };
const SOURCE_OPTIONS = ['LinkedIn', 'Referral', 'Job Board', 'Sourced'];

const EMPTY = {
  name: '', email: '', phone: '', current_title: '', current_employer: '', skills: '',
  resume_summary: '', source: 'LinkedIn', owner_user_id: '',
};

function CandidateForm({ initial, users, onCancel, onSubmit, saving, error }) {
  const [values, setValues] = useState(initial);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal
      title={initial.id ? 'Edit Candidate' : 'New Candidate'}
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? 'Saving…' : 'Save Candidate'}</Button>
        </>
      }
    >
      <FormError error={error} />
      <FormGrid>
        <Field label="Full name" required>
          <TextInput value={values.name} onChange={set('name')} placeholder="Jasmine Whitfield" />
        </Field>
        <Field label="Email" required>
          <TextInput type="email" value={values.email} onChange={set('email')} placeholder="jasmine.whitfield@personalmail.com" />
        </Field>
        <Field label="Phone" required>
          <TextInput value={values.phone} onChange={set('phone')} placeholder="(512) 555-0100" />
        </Field>
        <Field label="Current title" required>
          <TextInput value={values.current_title} onChange={set('current_title')} placeholder="Senior Backend Engineer" />
        </Field>
        <Field label="Current employer" required>
          <TextInput value={values.current_employer} onChange={set('current_employer')} placeholder="Pinewood Systems" />
        </Field>
        <Field label="Source" required>
          <SelectInput value={values.source} onChange={set('source')}>
            {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectInput>
        </Field>
        <Field label="Skills" required hint="Comma-separated">
          <TextInput value={values.skills} onChange={set('skills')} placeholder="Python, Django, PostgreSQL, AWS" />
        </Field>
        <Field label="Owner" required>
          <SelectInput value={values.owner_user_id} onChange={set('owner_user_id')}>
            <option value="">Select owner…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectInput>
        </Field>
      </FormGrid>
      <Field label="Resume summary">
        <TextArea value={values.resume_summary || ''} onChange={set('resume_summary')} placeholder="Short summary of experience and fit…" />
      </Field>
    </Modal>
  );
}

export default function Candidates() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function load() {
    api.candidates().then(setRows);
  }

  useEffect(() => {
    load();
    api.users().then(setUsers);
  }, []);

  if (!rows) return <Layout title="Candidates"><Spinner /></Layout>;

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
        id: row.id, name: row.name, email: row.email, phone: row.phone, current_title: row.current_title,
        current_employer: row.current_employer, skills: row.skills, resume_summary: row.resume_summary || '',
        source: row.source, owner_user_id: row.owner_user_id,
      },
    });
  }

  async function handleSubmit(values) {
    setSaving(true);
    setFormError(null);
    try {
      if (modal.mode === 'create') {
        const created = await api.createCandidate(values);
        setRows((prev) => [created, ...prev]);
      } else {
        const updated = await api.updateCandidate(modal.row.id, values);
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
      await api.deleteCandidate(deleteRow.id);
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
      'roster-candidates.csv',
      ['Name', 'Email', 'Phone', 'Current Title', 'Current Employer', 'Skills', 'Source', 'Owner', 'Submissions', 'Added'],
      rows.map((r) => [r.name, r.email, r.phone, r.current_title, r.current_employer, r.skills, r.source, r.owner_name, r.submission_count, r.created_at])
    );
  }

  const cols = [
    { key: 'name', header: 'Candidate', render: (r) => <CellName primary={r.name} secondary={r.current_title} avatar color={r.owner_color} /> },
    { key: 'current_employer', header: 'Employer', render: (r) => <span className="text-sm text-muted">{r.current_employer}</span> },
    { key: 'skills', header: 'Skills', render: (r) => <span className="text-sm text-muted truncate block max-w-[220px]">{r.skills}</span> },
    { key: 'source', header: 'Source', render: (r) => <Badge tone={SOURCE_TONE[r.source] || 'neutral'}>{r.source}</Badge> },
    { key: 'submission_count', header: 'Submissions', render: (r) => r.submission_count },
    { key: 'created_at', header: 'Added', render: (r) => shortDate(r.created_at) },
    {
      key: 'actions', header: '', className: 'w-20',
      render: (r) => <RowActions onEdit={() => openEdit(r)} onDelete={() => { setDeleteError(null); setDeleteRow(r); }} />,
    },
  ];

  return (
    <Layout
      title="Candidates"
      count={rows.length}
      actions={
        <>
          <Button variant="outline" onClick={handleExport}><Icon name="download" size={15} /> Export</Button>
          <Button onClick={openCreate}><Icon name="plus" size={15} /> New Candidate</Button>
        </>
      }
    >
      <Card>
        <Table cols={cols} rows={rows} />
      </Card>

      {modal && (
        <CandidateForm
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
          title="Delete candidate?"
          message={`This will permanently remove ${deleteRow.name} from the talent pool.`}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
