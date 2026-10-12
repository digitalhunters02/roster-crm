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

import { useT } from '../auth/i18n.js';
import { useFeatureGate } from '../billing/UpgradeNotice.jsx';
const STATUS_TONE = { Draft: 'neutral', Sent: 'blue', Paid: 'green', Overdue: 'rose' };
const STATUS_OPTIONS = ['Draft', 'Sent', 'Paid', 'Overdue'];

const EMPTY = { placement_id: '', period_start: '', period_end: '', hours: '', amount: '', status: 'Draft' };

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
        <Field label={t('Amount')} required>
          <TextInput type="number" min="0" step="0.01" value={values.amount} onChange={set('amount')} placeholder="7600" />
        </Field>
      </FormGrid>
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

  function handleExport() {
    downloadCsv(
      'roster-timesheets.csv',
      [t('Candidate'), t('Client'), t('Period Start'), t('Period End'), t('Hours'), t('Amount'), t('Status')],
      rows.map((r) => [r.candidate_name, r.client_name, r.period_start, r.period_end, r.hours, r.amount, r.status])
    );
  }

  const cols = [
    { key: 'candidate_name', header: t('Candidate'), render: (r) => <CellName primary={r.candidate_name} secondary={`${r.client_name} · ${r.job_title}`} /> },
    { key: 'period', header: t('Period'), render: (r) => <span className="text-sm text-muted">{shortDate(r.period_start)} – {shortDate(r.period_end)}</span> },
    { key: 'hours', header: t('Hours'), render: (r) => r.hours },
    { key: 'amount', header: t('Amount'), render: (r) => <span className="font-medium">{money(r.amount)}</span> },
    { key: 'status', header: t('Status'), render: (r) => <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge> },
    {
      key: 'actions', header: '', className: 'w-20',
      render: (r) => <RowActions onEdit={() => openEdit(r)} onDelete={() => { setDeleteError(null); setDeleteRow(r); }} />,
    },
  ];

  return (
    <Layout
      title={t('Timesheets & Invoicing')}
      count={rows.length}
      actions={
        <>
          <Button variant="outline" onClick={handleExport}><Icon name="download" size={15} /> {t('Export')}</Button>
          <Button onClick={openCreate}><Icon name="plus" size={15} /> {t('New Timesheet')}</Button>
        </>
      }
    >
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
