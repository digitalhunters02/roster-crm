// Candidates in the database who look like a fit for a job (keyword match on title, skills and summary: no AI cost).
import { useEffect, useState } from 'react';
import api from '../api.js';
import { Modal, Button, Badge, Spinner, FormError } from './ui.jsx';
import { useT } from '../auth/i18n.js';

export default function JobSuggestionsModal({ job, onClose }) {
  const { t } = useT();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.jobSuggestions(job.id).then(setRows).catch((e) => setError(e.message)); }, [job.id]);
  return (
    <Modal title={t('Suggested candidates')} sub={job.title} onClose={onClose} wide footer={<Button variant="outline" onClick={onClose}>{t('Close')}</Button>}>
      <FormError error={error} />
      {!rows && !error && <Spinner />}
      {rows && rows.length === 0 && <p className="text-sm text-muted" data-testid="sugg-empty">{t('No matches yet. Add skills to your candidates and details to the job notes.')}</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-lineSoft border border-lineSoft rounded-lg" data-testid="sugg-list">
          {rows.map((r) => (
            <li key={r.id} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{r.name}</span>
                <span className="text-sm text-muted">{r.current_title}</span>
                <Badge tone="brand" className="ml-auto">{t('Match {n}', { n: r.score })}</Badge>
              </div>
              <p className="text-xs text-muted mt-1 break-words">{t('Matches')}: {r.matched.join(', ')}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-faint mt-3">{t('Based on words in common. You decide who to submit.')}</p>
    </Modal>
  );
}
