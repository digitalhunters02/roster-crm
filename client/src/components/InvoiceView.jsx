// An invoice on screen and on paper. Rendered straight into <body> (outside #root) so printing shows only the sheet.
// The "Pay online" button points to the agency's own payment link (Stripe Payment Link, Square, PayPal...): Roster stores no card or bank data.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Spinner } from './ui.jsx';
import Icon from './Icon.jsx';
import { useT } from '../auth/i18n.js';

const usd = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const day = (iso) => {
  if (!iso) return '-';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function InvoiceView({ load, onClose }) {
  const { t } = useT();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    load().then((d) => alive && setInv(d)).catch((e) => alive && setError(e.message));
    document.body.classList.add('invoice-open');
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { alive = false; document.body.classList.remove('invoice-open'); window.removeEventListener('keydown', esc); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const approved = inv?.client_approved_at;
  return createPortal(
    <div className="invoice-overlay fixed inset-0 z-[60] overflow-y-auto bg-ink/50 p-3 sm:p-6" data-testid="invoice-view">
      <div className="invoice-actions max-w-[760px] mx-auto mb-3 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => window.print()} disabled={!inv}><Icon name="fileText" size={14} /> {t('Print / Save as PDF')}</Button>
        <Button variant="outline" onClick={onClose}>{t('Close')}</Button>
      </div>
      <div className="invoice-sheet max-w-[760px] mx-auto bg-white text-ink rounded-lg shadow-2xl p-6 sm:p-10">
        {!inv && !error && <Spinner />}
        {error && <p className="text-sm text-rose" role="alert">{error}</p>}
        {inv && (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-line">
              <div className="flex items-center gap-3 min-w-0">
                {inv.agency.logo && <img src={inv.agency.logo} alt="" className="w-12 h-12 rounded-lg object-cover" />}
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold break-words">{inv.agency.name || t('Your agency')}</p>
                  <p className="text-xs text-muted break-words">{[inv.agency.address, inv.agency.phone, inv.agency.email].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted">{t('Invoice')}</p>
                <p className="font-display text-xl font-semibold" data-testid="invoice-number">{inv.number}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 py-5 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted mb-1">{t('Bill to')}</p>
                <p className="font-semibold">{inv.client.company_name}</p>
                {inv.client.contact_name && <p className="text-muted">{inv.client.contact_name}</p>}
                {inv.client.address && <p className="text-muted break-words">{inv.client.address}</p>}
                {inv.client.contact_email && <p className="text-muted break-words">{inv.client.contact_email}</p>}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 content-start sm:justify-self-end">
                <dt className="text-muted">{t('Issue date')}</dt><dd className="text-right">{day(inv.issue_date)}</dd>
                <dt className="text-muted">{t('Due date')}</dt><dd className="text-right">{day(inv.due_date)}</dd>
                <dt className="text-muted">{t('Period')}</dt><dd className="text-right">{day(inv.period_start)} – {day(inv.period_end)}</dd>
                <dt className="text-muted">{t('Status')}</dt><dd className="text-right">{t(inv.status)}</dd>
              </dl>
            </div>

            <table className="w-full text-sm border-t border-line">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted text-left">
                  <th className="py-2 pr-2 font-medium">{t('Description')}</th>
                  <th className="py-2 px-2 font-medium text-right">{t('Hours')}</th>
                  <th className="py-2 px-2 font-medium text-right">{t('Rate')}</th>
                  <th className="py-2 pl-2 font-medium text-right">{t('Amount')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-lineSoft">
                  <td className="py-3 pr-2 break-words">{inv.line.description}</td>
                  <td className="py-3 px-2 text-right">{inv.line.hours}</td>
                  <td className="py-3 px-2 text-right">{usd(inv.line.rate)}</td>
                  <td className="py-3 pl-2 text-right">{usd(inv.line.amount)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td colSpan={3} className="py-3 pr-2 text-right font-semibold">{t('Total due')}</td>
                  <td className="py-3 pl-2 text-right font-display text-lg font-semibold" data-testid="invoice-total">{usd(inv.total)}</td>
                </tr>
              </tfoot>
            </table>

            {(inv.payment_note || inv.payment_url) && (
              <div className="mt-4 rounded-lg bg-wash p-4 text-sm">
                {inv.payment_note && <p className="text-muted whitespace-pre-line break-words">{inv.payment_note}</p>}
                {inv.payment_url && (
                  <a href={inv.payment_url} target="_blank" rel="noopener noreferrer" data-testid="pay-online"
                    className="invoice-actions mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand text-white font-semibold text-sm px-4 py-2 hover:bg-brand/90">
                    {t('Pay online')} <Icon name="arrowUpRight" size={14} />
                  </a>
                )}
              </div>
            )}
            {approved && <p className="mt-4 text-xs text-green">{t('Approved by {name}', { name: inv.client_approved_by || '' })} · {day(approved)}</p>}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
