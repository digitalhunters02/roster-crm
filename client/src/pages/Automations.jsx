import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, Badge, Spinner, Button, Modal, ConfirmDialog, Field, TextInput, TextArea, FormError, IconButton,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const EMPTY = { name: '', trigger_desc: '', action_desc: '', active: true };

function AutomationForm({ onCancel, onSubmit, saving, error }) {
  const [values, setValues] = useState(EMPTY);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal
      title="New Automation"
      onClose={onCancel}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? 'Saving…' : 'Save Automation'}</Button>
        </>
      }
    >
      <FormError error={error} />
      <Field label="Name" required>
        <TextInput value={values.name} onChange={set('name')} placeholder="Flag overdue timesheets" />
      </Field>
      <Field label="Trigger" required>
        <TextArea value={values.trigger_desc} onChange={set('trigger_desc')} placeholder="Timesheet status is Sent and 15 days have passed" />
      </Field>
      <Field label="Action" required>
        <TextArea value={values.action_desc} onChange={set('action_desc')} placeholder="Mark the timesheet Overdue and notify accounts receivable" />
      </Field>
      <Field label="State">
        <label className="flex items-center gap-2 mt-2 text-sm text-ink">
          <input
            type="checkbox"
            className="accent-brand"
            checked={values.active}
            onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
          />
          Active
        </label>
      </Field>
    </Modal>
  );
}

export default function Automations() {
  const [rows, setRows] = useState(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [toggleBusyId, setToggleBusyId] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    api.automations().then(setRows);
  }, []);

  if (!rows) return <Layout title="Automations"><Spinner /></Layout>;

  async function handleSubmit(values) {
    setSaving(true);
    setFormError(null);
    try {
      const created = await api.createAutomation(values);
      setRows((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCreating(false);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    setToggleBusyId(row.id);
    try {
      const updated = await api.setAutomationActive(row.id, !row.active);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } finally {
      setToggleBusyId(null);
    }
  }

  async function handleDelete() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteAutomation(deleteRow.id);
      setRows((prev) => prev.filter((r) => r.id !== deleteRow.id));
      setDeleteRow(null);
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <Layout
      title="Automations"
      count={rows.length}
      actions={<Button onClick={() => { setFormError(null); setCreating(true); }}><Icon name="plus" size={15} /> New Automation</Button>}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="rounded-lg p-2 bg-brandTint text-brand"><Icon name="zap" size={16} /></span>
                <p className="text-sm font-semibold text-ink truncate">{a.name}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  disabled={toggleBusyId === a.id}
                  onClick={() => toggleActive(a)}
                  className="disabled:opacity-50"
                  title={a.active ? 'Click to pause' : 'Click to activate'}
                >
                  <Badge tone={a.active ? 'green' : 'neutral'} className="cursor-pointer hover:opacity-80">
                    {a.active ? 'Active' : 'Paused'}
                  </Badge>
                </button>
                <IconButton icon="trash" title="Delete" tone="danger" onClick={() => { setDeleteError(null); setDeleteRow(a); }} />
              </div>
            </div>
            <div className="text-sm text-muted space-y-1.5">
              <p><span className="font-medium text-ink">Trigger:</span> {a.trigger_desc}</p>
              <p><span className="font-medium text-ink">Action:</span> {a.action_desc}</p>
            </div>
            <p className="text-xs text-faint mt-3">Ran {a.runs_30d} time{a.runs_30d === 1 ? '' : 's'} in the last 30 days</p>
          </Card>
        ))}
      </div>

      {creating && (
        <AutomationForm
          onCancel={() => setCreating(false)}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
        />
      )}

      {deleteRow && (
        <ConfirmDialog
          title="Delete automation?"
          message={`This will permanently remove "${deleteRow.name}".`}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
