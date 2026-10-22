import { useEffect, useState } from 'react';
import { GateIconButton } from '../plans/GateButton.jsx';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, Table, Badge, CellName, Spinner, Button, Modal, ConfirmDialog, IconButton,
  Field, TextInput, TextArea, SelectInput, FormGrid, FormError, RowActions,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { shortDate } from '../format.js';
import { downloadCsv } from '../csv.js';
import JobSuggestionsModal from '../components/JobSuggestionsModal.jsx';
import AiWriteButton from '../components/AiWriteButton.jsx';
import OfficeField, { OfficeFilter } from '../offices/OfficeField.jsx';

import { useT } from '../auth/i18n.js';
const STATUS_TONE = { Open: 'green', 'On Hold': 'amber', Filled: 'blue', Cancelled: 'neutral' };
const STATUS_OPTIONS = ['Open', 'On Hold', 'Filled', 'Cancelled'];
const TYPE_OPTIONS = ['Contract', 'Permanent', 'Contract-to-Hire'];

const EMPTY = {
  client_id: '', title: '', employment_type: 'Permanent', pay_range: '', location: '',
  status: 'Open', owner_user_id: '', opened_date: '', notes: '', office_id: '',
};

function JobForm({ initial, clients, users, onCancel, onSubmit, saving, error }) {
  const { t } = useT();
  const [values, setValues] = useState(initial);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal
      title={initial.id ? t('Edit Job') : t('New Job')}
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>{t('Cancel')}</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? t('Saving…') : t('Save Job')}</Button>
        </>
      }
    >
      <FormError error={error} />
      <FormGrid>
        <Field label={t('Client')} required>
          <SelectInput value={values.client_id} onChange={set('client_id')}>
            <option value="">{t('Select client…')}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </SelectInput>
        </Field>
        <Field label={t('Job title')} required>
          <TextInput value={values.title} onChange={set('title')} placeholder={t('Senior Backend Engineer')} />
        </Field>
        <Field label={t('Employment type')}>
          <SelectInput value={values.employment_type} onChange={set('employment_type')}>
            {TYPE_OPTIONS.map((o) => <option key={o} value={o}>{t(o)}</option>)}
          </SelectInput>
        </Field>
        <Field label={t('Pay range')} hint={t('Salary or bill rate as shown to candidates/clients')}>
          <TextInput value={values.pay_range} onChange={set('pay_range')} placeholder="$130,000 – $150,000" />
        </Field>
        <Field label={t('Location')}>
          <TextInput value={values.location} onChange={set('location')} placeholder={t('Austin, TX')} />
        </Field>
        <Field label={t('Status')} required>
          <SelectInput value={values.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t(s)}</option>)}
          </SelectInput>
        </Field>
        <Field label={t('Owner')} required>
          <SelectInput value={values.owner_user_id} onChange={set('owner_user_id')}>
            <option value="">{t('Select owner…')}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectInput>
        </Field>
        <Field label={t('Opened date')}>
          <TextInput type="date" value={values.opened_date} onChange={set('opened_date')} />
        </Field>
        <OfficeField value={values.office_id} onChange={set('office_id')} />
      </FormGrid>
      <Field label={t('Notes')}>
        <AiWriteButton label={t('Write job description with AI')} testId="ai-job" disabled={!values.title?.trim()}
          run={() => api.aiJobDescription({ fields: { ...values, client_industry: '' } })}
          onText={(text) => setValues((v) => ({ ...v, notes: text }))} />
        <TextArea value={values.notes || ''} onChange={set('notes')} placeholder={t('Intake notes, must-haves, client quirks…')} />
      </Field>
    </Modal>
  );
}

export default function Jobs() {
  const { t } = useT();
  const [rows, setRows] = useState(null);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const [suggestFor, setSuggestFor] = useState(null);
  const [office, setOffice] = useState('');

  function load() {
    api.jobs().then(setRows);
  }

  useEffect(() => {
    load();
    api.clients().then(setClients);
    api.users().then(setUsers);
  }, []);

  if (!rows) return <Layout title={t('Jobs')}><Spinner /></Layout>;

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
        opened_date: row.opened_date, notes: row.notes || '', office_id: row.office_id ?? '',
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
      [t('Title'), t('Client'), t('Type'), t('Pay Range'), t('Location'), t('Status'), t('Owner'), t('Opened'), t('Submissions')],
      rows.map((r) => [r.title, r.client_name, r.employment_type, r.pay_range, r.location, r.status, r.owner_name, r.opened_date, r.submission_count])
    );
  }

  const cols = [
    { key: 'title', header: t('Job'), render: (r) => <CellName primary={r.title} secondary={r.client_name} /> },
    { key: 'employment_type', header: t('Type'), render: (r) => <span className="text-sm text-muted">{t(r.employment_type)}</span> },
    { key: 'pay_range', header: t('Pay Range'), render: (r) => <span className="text-sm text-ink font-medium">{r.pay_range}</span> },
    { key: 'location', header: t('Location'), render: (r) => <span className="text-sm text-muted">{r.location}</span> },
    { key: 'submission_count', header: t('Submissions'), render: (r) => r.submission_count },
    { key: 'owner_name', header: t('Owner'), render: (r) => <span className="text-sm text-muted">{r.owner_name}</span> },
    { key: 'status', header: t('Status'), render: (r) => <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge> },
    {
      key: 'actions', header: '', className: 'w-28',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5">
          <GateIconButton gate="suggestions" icon="star" title={t('Suggested candidates')} onClick={() => setSuggestFor(r)} />
          <RowActions onEdit={() => openEdit(r)} onDelete={() => { setDeleteError(null); setDeleteRow(r); }} />
        </div>
      ),
    },
  ];

  return (
    <Layout
      title={t('Jobs')}
      count={rows.length}
      actions={
        <>
          <OfficeFilter value={office} onChange={setOffice} />
          <Button variant="outline" onClick={handleExport}><Icon name="download" size={15} /> {t('Export')}</Button>
          <Button onClick={openCreate}><Icon name="plus" size={15} /> {t('New Job')}</Button>
        </>
      }
    >
      <Card>
        <Table cols={cols} rows={office ? rows.filter((r) => String(r.office_id) === office) : rows} />
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

      {suggestFor && <JobSuggestionsModal job={suggestFor} onClose={() => setSuggestFor(null)} />}

      {deleteRow && (
        <ConfirmDialog
          title={t('Delete job?')}
          message={t('This will permanently remove {title} at {client}.', { title: deleteRow.title, client: deleteRow.client_name })}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
