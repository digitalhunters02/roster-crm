import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, Table, Badge, CellName, Spinner, Button, Modal, ConfirmDialog, IconButton,
  Field, TextInput, TextArea, SelectInput, FormGrid, FormError, RowActions,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import MessagesModal from '../components/MessagesModal.jsx';
import { shortDate } from '../format.js';
import { downloadCsv } from '../csv.js';
import PhotoImportButton from '../components/PhotoImportButton.jsx';

import { useT } from '../auth/i18n.js';
import { useAuth } from '../auth/AuthContext.jsx';
const SOURCE_TONE = { LinkedIn: 'blue', Referral: 'green', 'Job Board': 'amber', Sourced: 'brand' };
const SOURCE_OPTIONS = ['LinkedIn', 'Referral', 'Job Board', 'Sourced'];

const EMPTY = {
  name: '', email: '', phone: '', current_title: '', current_employer: '', skills: '',
  resume_summary: '', source: 'LinkedIn', owner_user_id: '',
};

function CandidateForm({ initial, users, onCancel, onSubmit, saving, error }) {
  const { t } = useT();
  const { account } = useAuth();
  const [values, setValues] = useState(initial.owner_user_id || !account?.userId ? initial : { ...initial, owner_user_id: account.userId });
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const [resumeText, setResumeText] = useState('');
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeMsg, setResumeMsg] = useState('');
  const [resumeBusy, setResumeBusy] = useState(false);

  // Simple resume reading: pulls name, contact, title, employer and skills out of pasted text (no AI, no cost).
  async function readResume() {
    setResumeMsg('');
    setResumeBusy(true);
    try {
      const r = await api.parseResume(resumeText);
      setValues((v) => {
        const next = { ...v };
        for (const k of ['name', 'email', 'phone', 'current_title', 'current_employer', 'skills', 'resume_summary']) if (r[k]) next[k] = r[k];
        return next;
      });
      setResumeMsg(t('Fields filled in. Check them before saving.'));
    } catch (e) {
      setResumeMsg(e.body?.code === 'resume_too_short' ? t('Paste the resume text (at least a few lines).') : t('Could not read this text.'));
    } finally {
      setResumeBusy(false);
    }
  }

  return (
    <Modal
      title={initial.id ? t('Edit Candidate') : t('New Candidate')}
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>{t('Cancel')}</Button>
          <Button onClick={() => onSubmit(values)} disabled={saving}>{saving ? t('Saving…') : t('Save Candidate')}</Button>
        </>
      }
    >
      <FormError error={error} />
      {!initial.id && (
        <div className="mb-4 rounded-md border border-line bg-wash px-3 py-2.5">
          <button type="button" className="text-sm font-semibold text-brand" onClick={() => setResumeOpen((o) => !o)} data-testid="resume-toggle">
            {resumeOpen ? t('Hide resume paste') : t('Fill from resume text')}
          </button>
          {resumeOpen && (
            <div className="mt-2">
              <TextArea value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder={t('Paste the resume text here…')} data-testid="resume-text" />
              <div className="flex items-center gap-3 mt-2">
                <Button size="sm" variant="outline" onClick={readResume} disabled={resumeBusy || !resumeText.trim()} data-testid="resume-read">{resumeBusy ? t('Reading…') : t('Read resume')}</Button>
                {resumeMsg && <span className="text-xs text-muted" data-testid="resume-msg">{resumeMsg}</span>}
              </div>
            </div>
          )}
        </div>
      )}
      <FormGrid>
        <Field label={t('Full name')} required>
          <TextInput value={values.name} onChange={set('name')} placeholder={t('Jasmine Whitfield')} />
        </Field>
        <Field label={t('Email')}>
          <TextInput type="email" value={values.email} onChange={set('email')} placeholder={t('jasmine.whitfield@personalmail.com')} />
        </Field>
        <Field label={t('Phone')}>
          <TextInput value={values.phone} onChange={set('phone')} placeholder="(512) 555-0100" />
        </Field>
        <Field label={t('Current title')}>
          <TextInput value={values.current_title} onChange={set('current_title')} placeholder={t('Senior Backend Engineer')} />
        </Field>
        <Field label={t('Current employer')}>
          <TextInput value={values.current_employer} onChange={set('current_employer')} placeholder={t('Pinewood Systems')} />
        </Field>
        <Field label={t('Source')}>
          <SelectInput value={values.source} onChange={set('source')}>
            {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{t(s)}</option>)}
          </SelectInput>
        </Field>
        <Field label={t('Skills')} hint={t('Comma-separated')}>
          <TextInput value={values.skills} onChange={set('skills')} placeholder={t('Python, Django, PostgreSQL, AWS')} />
        </Field>
        <Field label={t('Owner')} required>
          <SelectInput value={values.owner_user_id} onChange={set('owner_user_id')}>
            <option value="">{t('Select owner…')}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectInput>
        </Field>
      </FormGrid>
      <Field label={t('Resume summary')}>
        <TextArea value={values.resume_summary || ''} onChange={set('resume_summary')} placeholder={t('Short summary of experience and fit…')} />
      </Field>
    </Modal>
  );
}

export default function Candidates() {
  const { t } = useT();
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [messagesFor, setMessagesFor] = useState(null);

  function load() {
    api.candidates().then(setRows);
  }

  useEffect(() => {
    load();
    api.users().then(setUsers);
  }, []);

  if (!rows) return <Layout title={t('Candidates')}><Spinner /></Layout>;

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
      [t('Name'), t('Email'), t('Phone'), t('Current Title'), t('Current Employer'), t('Skills'), t('Source'), t('Owner'), t('Submissions'), t('Added')],
      rows.map((r) => [r.name, r.email, r.phone, r.current_title, r.current_employer, r.skills, r.source, r.owner_name, r.submission_count, r.created_at])
    );
  }

  const cols = [
    { key: 'name', header: t('Candidate'), render: (r) => <CellName primary={r.name} secondary={r.current_title} avatar color={r.owner_color} /> },
    { key: 'current_employer', header: t('Employer'), render: (r) => <span className="text-sm text-muted">{r.current_employer}</span> },
    { key: 'skills', header: t('Skills'), render: (r) => <span className="text-sm text-muted truncate block max-w-[220px]">{r.skills}</span> },
    { key: 'source', header: t('Source'), render: (r) => <Badge tone={SOURCE_TONE[r.source] || 'neutral'}>{r.source}</Badge> },
    { key: 'submission_count', header: t('Submissions'), render: (r) => r.submission_count },
    { key: 'created_at', header: t('Added'), render: (r) => shortDate(r.created_at) },
    {
      key: 'actions', header: '', className: 'w-28',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton icon="mail" title={t('Messages')} onClick={() => setMessagesFor(r)} />
          <RowActions onEdit={() => openEdit(r)} onDelete={() => { setDeleteError(null); setDeleteRow(r); }} />
        </div>
      ),
    },
  ];

  return (
    <Layout
      title={t('Candidates')}
      count={rows.length}
      actions={
        <>
          <Button variant="outline" onClick={handleExport}><Icon name="download" size={15} /> {t('Export')}</Button>
          <PhotoImportButton
            kind="clients" title={t('Import candidates from a photo')} onImported={load}
            fields={[
              { key: 'name', label: 'photo.f.name' }, { key: 'phone', label: 'photo.f.phone' }, { key: 'email', label: 'photo.f.email' },
              { key: 'notes', label: t('Title, employer or skills'), wide: true },
            ]}
            validate={(r) => (String(r.name || '').trim() ? '' : 'photo.missingName')}
            toPayload={(r) => ({ name: r.name.trim(), phone: r.phone || '', email: r.email || '', notes: r.notes || '' })}
            onSave={async (b) => {
              const users = await api.users();
              if (!users?.length) throw new Error(t('Add a recruiter first (Settings → Team).'));
              await api.createCandidate({
                name: b.name, email: b.email || '', phone: b.phone || '', current_title: '', current_employer: '',
                skills: b.notes || '', resume_summary: b.notes || null, source: 'Sourced', owner_user_id: users[0].id,
              });
            }}
          />
          <Button onClick={openCreate}><Icon name="plus" size={15} /> {t('New Candidate')}</Button>
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

      {messagesFor && <MessagesModal candidate={messagesFor} onClose={() => setMessagesFor(null)} />}

      {deleteRow && (
        <ConfirmDialog
          title={t('Delete candidate?')}
          message={t('This will permanently remove {name} from the talent pool.', { name: deleteRow.name })}
          error={deleteError}
          busy={deleteBusy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
