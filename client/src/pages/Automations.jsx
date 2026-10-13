import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, Badge, Spinner, Button, Modal, ConfirmDialog, Field, TextInput, SelectInput, FormError, IconButton,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../auth/i18n.js';
import { refreshBilling } from '../billing/useBilling.js';

// Turns a server error into a short translated sentence (plan limits get the number).
function describeError(err, t) {
  if (err?.body?.code === 'plan_limit') return t('Your plan allows {n} active automations. Pause one or upgrade the plan.', { n: err.body.limit });
  if (err?.body?.code === 'rule_not_runnable') return t('This old rule has no trigger and cannot run. Delete it and create it again.');
  return err?.message || t('Something went wrong. Please try again.');
}

function AutomationForm({ catalog, onCancel, onSubmit, saving, error }) {
  const { t } = useT();
  const [values, setValues] = useState({ name: '', trigger_type: catalog[0]?.id || '', active: true });
  const picked = catalog.find((c) => c.id === values.trigger_type);

  return (
    <Modal
      title={t('New Automation')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>{t('Cancel')}</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving || !values.name.trim()}>{saving ? t('Saving…') : t('Save Automation')}</Button>
        </>
      }
    >
      <FormError error={error} />
      <Field label={t('Name')} required>
        <TextInput value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} placeholder={t('Flag overdue timesheets')} />
      </Field>
      <Field label={t('Trigger')} required hint={t('What starts the rule.')}>
        <SelectInput value={values.trigger_type} onChange={(e) => setValues((v) => ({ ...v, trigger_type: e.target.value }))} data-testid="automation-trigger">
          {catalog.map((c) => <option key={c.id} value={c.id}>{t(c.desc)}</option>)}
        </SelectInput>
      </Field>
      <Field label={t('Action')}>
        <p className="text-sm text-ink mt-1" data-testid="automation-action">{picked ? t(picked.action) : ''}</p>
        <p className="text-xs text-muted mt-1">{t('Every rule writes to the Activity log and emails the person in charge when email is set up. It runs once per record.')}</p>
      </Field>
      <Field label={t('State')}>
        <label className="flex items-center gap-2 mt-2 text-sm text-ink">
          <input type="checkbox" className="accent-brand" checked={values.active} onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))} />
          {t('Active')}
        </label>
      </Field>
    </Modal>
  );
}

export default function Automations() {
  const { t } = useT();
  const [rows, setRows] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [toggleBusyId, setToggleBusyId] = useState(null);
  const [toggleError, setToggleError] = useState('');
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [runMsg, setRunMsg] = useState('');

  const load = () => api.automations().then(setRows);
  useEffect(() => { load(); api.automationCatalog().then(setCatalog); }, []);

  if (!rows) return <Layout title={t('Automations')}><Spinner /></Layout>;

  async function handleSubmit(values) {
    setSaving(true);
    setFormError(null);
    try {
      const created = await api.createAutomation(values);
      setRows((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCreating(false);
      refreshBilling();
    } catch (e) {
      setFormError(describeError(e, t));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    setToggleBusyId(row.id);
    setToggleError('');
    try {
      const updated = await api.setAutomationActive(row.id, !row.active);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      refreshBilling();
    } catch (e) {
      setToggleError(describeError(e, t));
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
      refreshBilling();
    } catch (e) {
      setDeleteError(describeError(e, t));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function runNow() {
    setRunMsg('');
    const { fired } = await api.runAutomationsNow();
    setRunMsg(t('Daily checks done: {n} new alerts.', { n: fired }));
    load();
  }

  return (
    <Layout
      title={t('Automations')}
      count={rows.length}
      actions={
        <>
          <Button variant="outline" onClick={runNow} data-testid="run-checks"><Icon name="zap" size={15} /> {t('Run daily checks now')}</Button>
          <Button onClick={() => { setFormError(null); setCreating(true); }} data-testid="new-automation"><Icon name="plus" size={15} /> {t('New Automation')}</Button>
        </>
      }
    >
      <p className="text-sm text-muted mb-4 max-w-3xl">{t('Rules run by themselves: each one writes to the Activity log and emails the person in charge. Event rules fire when you save the change; the daily checks run every hour.')}</p>
      {runMsg && <p className="text-sm text-green bg-greenTint border border-green/30 rounded-md px-3 py-2 mb-4" data-testid="run-msg">{runMsg}</p>}
      {toggleError && <p className="text-sm text-rose bg-roseTint border border-rose/30 rounded-md px-3 py-2 mb-4" role="alert">{toggleError}</p>}
      {rows.length === 0 && <Card className="p-6 text-sm text-muted">{t('No rules yet. Create the first one with New Automation.')}</Card>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map((a) => (
          <Card key={a.id} className="p-5" data-testid="automation-card">
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="rounded-lg p-2 bg-brandTint text-brand flex-shrink-0"><Icon name="zap" size={16} /></span>
                <p className="text-sm font-semibold text-ink truncate">{t(a.name)}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {a.runnable ? (
                  <button
                    type="button"
                    disabled={toggleBusyId === a.id}
                    onClick={() => toggleActive(a)}
                    className="disabled:opacity-50"
                    title={a.active ? t('Click to pause') : t('Click to activate')}
                    data-testid="automation-toggle"
                  >
                    <Badge tone={a.active ? 'green' : 'neutral'} className="cursor-pointer hover:opacity-80">
                      {a.active ? t('Active') : t('Paused')}
                    </Badge>
                  </button>
                ) : (
                  <Badge tone="amber">{t('Old rule - not runnable')}</Badge>
                )}
                <IconButton icon="trash" title={t('Delete')} tone="danger" onClick={() => { setDeleteError(null); setDeleteRow(a); }} />
              </div>
            </div>
            <div className="text-sm text-muted space-y-1.5">
              <p><span className="font-medium text-ink">{t('Trigger:')}</span> {t(a.trigger_desc)}</p>
              <p><span className="font-medium text-ink">{t('Action:')}</span> {t(a.action_desc)}</p>
            </div>
            <p className="text-xs text-faint mt-3" data-testid="automation-runs">{t('Ran {n} times in the last 30 days', { n: a.runs_30d })}</p>
          </Card>
        ))}
      </div>

      {creating && (
        <AutomationForm catalog={catalog} onCancel={() => setCreating(false)} onSubmit={handleSubmit} saving={saving} error={formError} />
      )}

      {deleteRow && (
        <ConfirmDialog
          title={t('Delete automation?')}
          message={t('This will permanently remove "{name}".', { name: deleteRow.name })}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
