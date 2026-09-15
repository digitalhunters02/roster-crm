import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, Avatar, Spinner, Button, Modal, ConfirmDialog, IconButton,
  Field, TextInput, TextArea, SelectInput, FormGrid, FormError,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { shortDate } from '../format.js';

const STAGES = ['Sourced', 'Screened', 'Submitted to Client', 'Client Interview', 'Offer', 'Placed', 'Rejected', 'Withdrawn'];
const STAGE_COLOR = {
  Sourced: '#9498B3',
  Screened: '#2F6FE0',
  'Submitted to Client': '#C98A1D',
  'Client Interview': '#FF6B57',
  Offer: '#5B4EE0',
  Placed: '#3F9142',
  Rejected: '#D1477A',
  Withdrawn: '#5B5F7A',
};

const EMPTY = { candidate_id: '', job_id: '', stage: 'Sourced', owner_user_id: '', submitted_date: '', notes: '' };

function SubmissionForm({ initial, candidates, jobs, users, onCancel, onSubmit, saving, error }) {
  const [values, setValues] = useState(initial);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal
      title={initial.id ? 'Edit Submission' : 'New Submission'}
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? 'Saving…' : 'Save Submission'}</Button>
        </>
      }
    >
      <FormError error={error} />
      <FormGrid>
        <Field label="Candidate" required>
          <SelectInput value={values.candidate_id} onChange={set('candidate_id')}>
            <option value="">Select candidate…</option>
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Job" required>
          <SelectInput value={values.job_id} onChange={set('job_id')}>
            <option value="">Select job…</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title} — {j.client_name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Stage" required>
          <SelectInput value={values.stage} onChange={set('stage')}>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectInput>
        </Field>
        <Field label="Owner" required>
          <SelectInput value={values.owner_user_id} onChange={set('owner_user_id')}>
            <option value="">Select owner…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Submitted date" required>
          <TextInput type="date" value={values.submitted_date} onChange={set('submitted_date')} />
        </Field>
      </FormGrid>
      <Field label="Notes">
        <TextArea value={values.notes || ''} onChange={set('notes')} placeholder="Client feedback, next steps…" />
      </Field>
    </Modal>
  );
}

export default function Pipeline() {
  const [subs, setSubs] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function load() {
    api.submissions().then(setSubs);
  }

  useEffect(() => {
    load();
    api.candidates().then(setCandidates);
    api.jobs().then(setJobs);
    api.users().then(setUsers);
  }, []);

  if (!subs) return <Layout title="Pipeline"><Spinner /></Layout>;

  async function changeStage(id, stage) {
    const updated = await api.setSubmissionStage(id, stage);
    setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, stage: updated.stage } : s)));
  }

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
        id: row.id, candidate_id: row.candidate_id, job_id: row.job_id, stage: row.stage,
        owner_user_id: row.owner_user_id, submitted_date: row.submitted_date, notes: row.notes || '',
      },
    });
  }

  async function handleSubmit(values) {
    setSaving(true);
    setFormError(null);
    try {
      if (modal.mode === 'create') {
        const created = await api.createSubmission(values);
        setSubs((prev) => [created, ...prev]);
      } else {
        const updated = await api.updateSubmission(modal.row.id, values);
        setSubs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
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
      await api.deleteSubmission(deleteRow.id);
      setSubs((prev) => prev.filter((r) => r.id !== deleteRow.id));
      setDeleteRow(null);
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <Layout
      title="Pipeline"
      count={subs.length}
      actions={<Button onClick={openCreate}><Icon name="plus" size={15} /> New Submission</Button>}
    >
      <div className="h-full flex gap-4 overflow-x-auto">
        {STAGES.map((stage) => {
          const items = subs.filter((s) => s.stage === stage);
          return (
            <div key={stage} className="flex flex-col h-full min-h-0 w-72 flex-shrink-0">
              <div className="flex items-center gap-2 px-1 mb-2 flex-shrink-0">
                <span style={{ width: 8, height: 8, borderRadius: 999, background: STAGE_COLOR[stage] }} />
                <p className="text-sm font-semibold text-ink">{stage}</p>
                <span className="text-xs text-muted">{items.length}</span>
              </div>
              <div className="flex-grow min-h-0 overflow-y-auto space-y-2.5 pr-1 pb-2">
                {items.map((s) => (
                  <Card key={s.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-ink leading-snug">{s.candidate_name}</p>
                      <div className="flex items-center gap-0.5 -mt-1 -mr-1">
                        <IconButton icon="pencil" title="Edit" onClick={() => openEdit(s)} />
                        <IconButton icon="trash" title="Delete" tone="danger" onClick={() => { setDeleteError(null); setDeleteRow(s); }} />
                      </div>
                    </div>
                    <p className="text-xs text-muted mb-2.5">{s.job_title} · {s.client_name}</p>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs text-muted">Submitted {shortDate(s.submitted_date)}</span>
                      <Avatar name={s.owner_name} color={s.owner_color} size={22} />
                    </div>
                    {s.notes && (
                      <p className="text-xs text-muted bg-wash rounded px-2 py-1 mb-2.5 line-clamp-2">{s.notes}</p>
                    )}
                    <SelectInput
                      value={s.stage}
                      onChange={(e) => changeStage(s.id, e.target.value)}
                      className="!text-xs !py-1.5 !bg-wash"
                    >
                      {STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
                    </SelectInput>
                  </Card>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-faint text-center py-6 border border-dashed border-line rounded-lg">No submissions</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <SubmissionForm
          initial={modal.initial}
          candidates={candidates}
          jobs={jobs}
          users={users}
          onCancel={() => setModal(null)}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
        />
      )}

      {deleteRow && (
        <ConfirmDialog
          title="Delete submission?"
          message={`This will remove ${deleteRow.candidate_name}'s submission for ${deleteRow.job_title}.`}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
