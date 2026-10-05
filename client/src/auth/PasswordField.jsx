import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from './AuthIcons.jsx';
import { useT } from './i18n.js';

export const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand placeholder:text-faint disabled:bg-wash disabled:text-muted';

// Password input with the show/hide "eye" button inside the field.
export default function PasswordField({ label, value, onChange, autoComplete = 'current-password', autoFocus = false, name, required = true }) {
  const { t } = useT();
  const [shown, setShown] = useState(false);
  return (
    <label className="block mb-3.5">
      <span className="block text-xs font-semibold text-muted mb-1.5">{label}</span>
      <span className="relative block">
        <input
          type={shown ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          className={`${inputCls} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? t('hidePassword') : t('showPassword')}
          title={shown ? t('hidePassword') : t('showPassword')}
          data-testid="toggle-password"
          className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-faint hover:text-muted transition-colors"
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </span>
    </label>
  );
}

export function TextField({ label, value, onChange, type = 'text', autoComplete, autoFocus = false, name, required = true }) {
  return (
    <label className="block mb-3.5">
      <span className="block text-xs font-semibold text-muted mb-1.5">{label}</span>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        className={inputCls}
      />
    </label>
  );
}
