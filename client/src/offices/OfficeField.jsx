import { Field, SelectInput } from '../components/ui.jsx';
import { useT } from '../auth/i18n.js';
import { useOffices } from './useOffices.js';

// "Office" select for a form. Shows nothing when the agency has no offices (every plan below Complete).
export default function OfficeField({ value, onChange }) {
  const { t } = useT();
  const offices = useOffices();
  if (!offices.length) return null;
  return (
    <Field label={t('Office')}>
      <SelectInput value={value ?? ''} onChange={onChange} data-testid="office-select">
        <option value="">{t('No office')}</option>
        {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </SelectInput>
    </Field>
  );
}

// Filter select for a list page: returns null when there are no offices.
export function OfficeFilter({ value, onChange }) {
  const { t } = useT();
  const offices = useOffices();
  if (!offices.length) return null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('Office')} data-testid="office-filter"
      className="rounded-md border border-line bg-surface text-sm px-2.5 py-2">
      <option value="">{t('All offices')}</option>
      {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}
