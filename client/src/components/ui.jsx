import { initialsOf } from '../format.js';
import Icon from './Icon.jsx';

export const TONES = {
  neutral: { bg: '#EEECFA', fg: '#5B5F7A', border: '#E4E1F5' },
  brand: { bg: '#E7E4FB', fg: '#5B4EE0', border: '#D3CCF5' },
  coral: { bg: '#FFE7E1', fg: '#D14B32', border: '#FFCFC2' },
  amber: { bg: '#FBEFDA', fg: '#8A620F', border: '#F3DDAE' },
  rose: { bg: '#FBE4ED', fg: '#A0295A', border: '#F3C4D8' },
  blue: { bg: '#E4EDFD', fg: '#1D53AE', border: '#C7D9F8' },
  teal: { bg: '#DEF5F1', fg: '#0B6D64', border: '#B9E6DD' },
  green: { bg: '#E3F5E1', fg: '#2C7230', border: '#C3E7C0' },
};

export function Button({ children, variant = 'default', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' };
  const variants = {
    default: 'bg-ink text-white hover:bg-ink/90',
    outline: 'border border-line bg-surface text-ink hover:bg-wash',
    ghost: 'text-muted hover:bg-wash hover:text-ink',
    brand: 'bg-brand text-white hover:bg-brand/90',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${className}`}
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.border}` }}
    >
      {children}
    </span>
  );
}

export function Dot({ color = '#9498B3', size = 8 }) {
  return <span style={{ width: size, height: size, background: color, borderRadius: 999, display: 'inline-block', flexShrink: 0 }} />;
}

export function Avatar({ name, color = '#9498B3', size = 30 }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function Mono({ name, color = '#9498B3', size = 30 }) {
  return (
    <span
      className="inline-flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.36, borderRadius: 8 }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function Card({ children, className = '', ...props }) {
  return (
    <div className={`bg-surface border border-line rounded-xl ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHead({ title, sub, action }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-3">
      <div>
        <h3 className="font-display text-[15px] font-semibold text-ink">{title}</h3>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Kpi({ label, value, sub, tone = 'neutral', icon }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</p>
        {icon && (
          <span className="rounded-lg p-1.5" style={{ background: t.bg, color: t.fg }}>
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>
      <p className="font-display text-[26px] font-bold text-ink mt-2 leading-none">{value}</p>
      {sub && <p className="text-xs text-muted mt-2">{sub}</p>}
    </Card>
  );
}

export function CellName({ primary, secondary, avatar, color }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {avatar && <Avatar name={primary} color={color} size={28} />}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{primary}</p>
        {secondary && <p className="text-xs text-muted truncate">{secondary}</p>}
      </div>
    </div>
  );
}

export function Muted({ children }) {
  return <span className="text-muted">{children}</span>;
}

export function Table({ cols, rows, rowH = 'py-3', keyField = 'id', onRowClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[720px]">
        <thead>
          <tr className="border-b border-line">
            {cols.map((c) => (
              <th
                key={c.key}
                className={`text-left text-xs font-semibold text-muted uppercase tracking-wide px-5 py-2.5 ${c.className || ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[keyField]}
              className={`border-b border-lineSoft last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-wash' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {cols.map((c) => (
                <td key={c.key} className={`px-5 ${rowH} align-middle ${c.className || ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="px-5 py-8 text-center text-sm text-muted">
                No records yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 bg-wash rounded-lg p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
            value === t.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center h-full w-full py-24">
      <div className="w-8 h-8 border-2 border-line border-t-brand rounded-full animate-spin" />
    </div>
  );
}

// -------------------- forms / modals --------------------

export function IconButton({ icon, onClick, title, tone = 'default', size = 15 }) {
  const tones = {
    default: 'text-muted hover:text-ink hover:bg-wash',
    danger: 'text-muted hover:text-rose hover:bg-roseTint',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${tones[tone]}`}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function RowActions({ onEdit, onDelete, editLabel = 'Edit', deleteLabel = 'Delete' }) {
  return (
    <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
      {onEdit && <IconButton icon="pencil" title={editLabel} onClick={onEdit} />}
      {onDelete && <IconButton icon="trash" title={deleteLabel} tone="danger" onClick={onDelete} />}
    </div>
  );
}

export function Modal({ title, sub, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        className={`relative bg-surface rounded-xl border border-line shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-line flex-shrink-0">
          <div>
            <h3 className="font-display text-[16px] font-semibold text-ink">{title}</h3>
            {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink -mt-1 -mr-1 p-1">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line flex-shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, error, busy, onCancel, onConfirm, confirmLabel }) {
  return (
    <Modal
      title={title || 'Delete record?'}
      onClose={onCancel}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className="!bg-rose hover:!bg-rose/90 text-white"
          >
            {busy ? 'Deleting…' : (confirmLabel || 'Delete')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{message}</p>
      {error && (
        <p className="text-sm text-rose bg-roseTint border border-rose/30 rounded-md px-3 py-2 mt-3">{error}</p>
      )}
    </Modal>
  );
}

const fieldInputCls =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand placeholder:text-faint disabled:bg-wash disabled:text-muted';

export function Field({ label, required, children, hint }) {
  return (
    <label className="block mb-3.5">
      <span className="block text-xs font-semibold text-muted mb-1.5">
        {label}
        {required && <span className="text-rose"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-faint mt-1">{hint}</span>}
    </label>
  );
}

export function TextInput(props) {
  return <input className={fieldInputCls} {...props} />;
}

export function TextArea(props) {
  return <textarea className={fieldInputCls} rows={3} {...props} />;
}

export function SelectInput({ children, ...props }) {
  return (
    <select className={fieldInputCls} {...props}>
      {children}
    </select>
  );
}

export function FormGrid({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">{children}</div>;
}

export function FormError({ error }) {
  if (!error) return null;
  return <p className="text-sm text-rose bg-roseTint border border-rose/30 rounded-md px-3 py-2 mb-3.5">{error}</p>;
}
