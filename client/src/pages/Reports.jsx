import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import { Card, CardHead, Kpi, Spinner, Badge, Avatar, Button } from '../components/ui.jsx';
import HBars from '../components/charts/HBars.jsx';
import ColBars from '../components/charts/ColBars.jsx';
import Icon from '../components/Icon.jsx';
import { money, pct } from '../format.js';
import { downloadCsv } from '../csv.js';

import { useT } from '../auth/i18n.js';
const STAGE_ORDER = ['Sourced', 'Screened', 'Submitted to Client', 'Client Interview', 'Offer', 'Placed', 'Rejected', 'Withdrawn'];
const STAGE_COLOR = {
  Sourced: '#9498B3', Screened: '#2F6FE0', 'Submitted to Client': '#C98A1D', 'Client Interview': '#FF6B57',
  Offer: '#5B4EE0', Placed: '#3F9142', Rejected: '#D1477A', Withdrawn: '#5B5F7A',
};
const INVOICE_TONE = { Draft: 'neutral', Sent: 'blue', Paid: 'green', Overdue: 'rose' };
const RECRUITER_COLORS = ['#5B4EE0', '#2F6FE0', '#0E9488', '#FF6B57', '#C98A1D', '#D1477A'];

export default function Reports() {
  const { t } = useT();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.reports().then(setData);
  }, []);

  if (!data) return <Layout title={t('Reports')}><Spinner /></Layout>;

  const funnelData = STAGE_ORDER
    .map((s) => data.funnelByStage.find((f) => f.stage === s))
    .filter(Boolean)
    .map((f) => ({ label: t(f.stage), value: f.count, color: STAGE_COLOR[f.stage] }));

  const recruiterData = data.placementsByRecruiter.map((r, i) => ({
    label: r.recruiter_name, value: r.total_fees, color: r.recruiter_color || RECRUITER_COLORS[i % RECRUITER_COLORS.length],
    display: r.placement_count === 1 ? t('{amount} · 1 placement', { amount: money(r.total_fees, true) }) : t('{amount} · {n} placements', { amount: money(r.total_fees, true), n: r.placement_count }),
  }));

  function exportFunnel() {
    downloadCsv('roster-pipeline-funnel.csv', [t('Stage'), t('Count')], data.funnelByStage.map((f) => [f.stage, f.count]));
  }
  function exportByRecruiter() {
    downloadCsv(
      'roster-placements-by-recruiter.csv',
      [t('Recruiter'), t('Placements'), t('Total Fees')],
      data.placementsByRecruiter.map((r) => [r.recruiter_name, r.placement_count, r.total_fees])
    );
  }
  function exportByMonth() {
    downloadCsv(
      'roster-placements-by-month.csv',
      [t('Month'), t('Placements'), t('Total Fees')],
      data.placementsByMonth.map((m) => [m.month, m.count, m.total_fees])
    );
  }

  return (
    <Layout title={t('Reports')}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label={t('Placement Rate')} value={pct(data.placementRate)} sub={t('{placed} placed of {decided} decided', { placed: data.placed, decided: data.decided })} tone="brand" icon="target" />
        <Kpi label={t('Total Placement Fees')} value={money(data.totalPlacementFees, true)} sub={t('All-time')} tone="green" icon="badge" />
        <Kpi label={t('Total Invoiced')} value={money(data.totalInvoiced, true)} sub={t('All timesheets')} tone="teal" icon="receipt" />
        <Kpi label={t('Submissions')} value={data.funnelByStage.reduce((s, f) => s + f.count, 0)} sub={t('All-time volume')} tone="blue" icon="funnel" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-1">
          <CardHead
            title={t('Pipeline Funnel by Stage')}
            sub={t('All submissions, all-time')}
            action={<Button variant="outline" size="sm" onClick={exportFunnel}><Icon name="download" size={13} /> {t('Export')}</Button>}
          />
          <div className="px-5 pb-5">
            <ColBars data={funnelData} height={220} formatValue={(v) => v} />
          </div>
        </Card>

        <Card className="p-1">
          <CardHead
            title={t('Placements & Fees by Recruiter')}
            sub={t('Total placement fees earned')}
            action={<Button variant="outline" size="sm" onClick={exportByRecruiter}><Icon name="download" size={13} /> {t('Export')}</Button>}
          />
          <div className="px-5 pb-5">
            {recruiterData.length > 0
              ? <HBars data={recruiterData} formatValue={(v) => money(v, true)} />
              : <p className="text-sm text-muted py-6 text-center">{t('No placements yet.')}</p>}
          </div>
        </Card>
      </div>

      {data.byOffice && data.byOffice.some((o) => o.office_id) && (
        <Card className="p-1 mb-6" data-testid="by-office">
          <CardHead title={t('Results by office')} sub={t('Placements, fees and amount billed per office (by the job\'s office)')} />
          <div className="divide-y divide-lineSoft">
            {data.byOffice.map((o) => (
              <div key={o.office_id || 0} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="font-medium text-ink flex-1 min-w-[8rem]">{o.office_name || t('No office')}</span>
                <span className="text-sm text-muted">{o.placement_count === 1 ? t('1 placement') : t('{n} placements', { n: o.placement_count })}</span>
                <span className="text-sm text-muted">{t('Fees')}: {money(o.total_fees, true)}</span>
                <span className="text-sm font-medium text-ink">{t('Billed')}: {money(o.billed, true)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-1">
          <CardHead
            title={t('Placements by Month')}
            sub={t('Count and fees per month')}
            action={<Button variant="outline" size="sm" onClick={exportByMonth}><Icon name="download" size={13} /> {t('Export')}</Button>}
          />
          <div className="divide-y divide-lineSoft">
            {data.placementsByMonth.map((m) => (
              <div key={m.month} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Badge tone="neutral">{m.month}</Badge>
                  <span className="text-sm text-muted">{m.count} {t('placement')}{m.count === 1 ? '' : 's'}</span>
                </div>
                <span className="text-sm font-medium text-ink">{money(m.total_fees)}</span>
              </div>
            ))}
            {data.placementsByMonth.length === 0 && <p className="text-sm text-muted py-6 text-center">{t('No placements yet.')}</p>}
          </div>
        </Card>

        <Card className="p-1">
          <CardHead title={t('Invoice Aging')} sub={t('Timesheets & invoices by status')} />
          <div className="divide-y divide-lineSoft">
            {data.invoiceAging.map((inv) => (
              <div key={inv.status} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Badge tone={INVOICE_TONE[inv.status] || 'neutral'}>{inv.status}</Badge>
                  <span className="text-sm text-muted">{inv.count} {t('invoice')}{inv.count === 1 ? '' : 's'}</span>
                </div>
                <span className="text-sm font-medium text-ink">{money(inv.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
