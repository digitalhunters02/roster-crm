import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import { Card, CardHead, Kpi, Spinner, Badge, Avatar } from '../components/ui.jsx';
import ColBars from '../components/charts/ColBars.jsx';
import Icon from '../components/Icon.jsx';
import { money, shortDateTime, shortDate } from '../format.js';

import { useT } from '../auth/i18n.js';
const STAGE_ORDER = ['Sourced', 'Screened', 'Submitted to Client', 'Client Interview', 'Offer', 'Placed', 'Rejected', 'Withdrawn'];
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

const ACT_ICON = { Call: 'phoneCall', Email: 'mail', Note: 'fileText', Meeting: 'users', Automation: 'zap' };
const ACT_TONE = { Call: 'blue', Email: 'brand', Note: 'amber', Meeting: 'teal', Automation: 'brand' };

export default function Dashboard() {
  const { t } = useT();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.dashboard().then(setData);
  }, []);

  if (!data) return <Layout title={t('Dashboard')}><Spinner /></Layout>;

  const { kpis, submissionsByStage, upcomingInterviews, recentActivity, openJobsAging } = data;
  const stageData = STAGE_ORDER
    .map((s) => submissionsByStage.find((p) => p.stage === s))
    .filter(Boolean)
    .map((p) => ({ label: t(p.stage), value: p.count, color: STAGE_COLOR[p.stage] }));

  return (
    <Layout title={t('Dashboard')}>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Kpi label={t('Open Jobs')} value={kpis.openJobs} sub={t('Active requisitions')} tone="brand" icon="briefcase" />
        <Kpi label={t('Active Pipeline')} value={kpis.activePipelineCandidates} sub={t('Candidates in motion')} tone="blue" icon="candidate" />
        <Kpi label={t('Interviews This Week')} value={kpis.interviewsThisWeek} sub={`${shortDate(data.ranges.weekStart)} – ${shortDate(data.ranges.weekEnd)}`} tone="coral" icon="calendarCheck" />
        <Kpi label={t('Recent Placements')} value={kpis.placementsRecent} sub={t('Last 30 days')} tone="green" icon="badge" />
        <Kpi label={t('Recent Revenue')} value={money(kpis.revenueRecent, true)} sub={t('Last 30 days: fees + paid invoices')} tone="teal" icon="receipt" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2 p-1">
          <CardHead title={t('Pipeline by Stage')} sub={t('All open and closed submissions')} />
          <div className="px-5 pb-5">
            <ColBars data={stageData} height={220} formatValue={(v) => v} />
          </div>
        </Card>

        <Card className="p-1">
          <CardHead title={t('Upcoming Interviews')} sub={t('Scheduled and confirmed')} />
          <div className="px-5 pb-4 space-y-3 max-h-[260px] overflow-y-auto">
            {upcomingInterviews.length === 0 && <p className="text-sm text-muted py-6 text-center">{t('Nothing on the calendar.')}</p>}
            {upcomingInterviews.map((iv) => (
              <div key={iv.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 text-muted"><Icon name="calendarCheck" size={14} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink leading-snug truncate">{iv.candidate_name} · {iv.job_title}</p>
                  <p className="text-xs text-muted">{iv.client_name} · {shortDateTime(iv.scheduled_at)}</p>
                </div>
                <Badge tone="coral">{iv.type}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-1">
          <CardHead title={t('Recent Activity')} sub={t('Calls, emails and notes across the team')} />
          <div className="divide-y divide-lineSoft max-h-[340px] overflow-y-auto">
            {recentActivity.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex-shrink-0"><Badge tone={ACT_TONE[a.type] || 'neutral'}><Icon name={ACT_ICON[a.type] || 'fileText'} size={12} /></Badge></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{a.subject}</p>
                    <p className="text-xs text-muted">{shortDateTime(a.occurred_at)}</p>
                  </div>
                </div>
                <Avatar name={a.owner_name} color={a.owner_color} size={24} />
              </div>
            ))}
            {recentActivity.length === 0 && <p className="text-sm text-muted py-6 text-center">{t('No activity logged yet.')}</p>}
          </div>
        </Card>

        <Card className="p-1">
          <CardHead title={t('Jobs Open the Longest')} sub={t('Aging open requisitions')} />
          <div className="divide-y divide-lineSoft">
            {openJobsAging.map((j) => (
              <div key={j.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{j.title}</p>
                  <p className="text-xs text-muted">{j.client_name} {t('· opened')} {shortDate(j.opened_date)}</p>
                </div>
                <Badge tone={j.days_open >= 30 ? 'rose' : 'amber'}>{j.days_open} {t('days')}</Badge>
              </div>
            ))}
            {openJobsAging.length === 0 && <p className="text-sm text-muted py-6 text-center">{t('No open jobs.')}</p>}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
