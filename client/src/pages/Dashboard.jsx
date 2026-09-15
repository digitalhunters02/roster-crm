import { useEffect, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import { Card, CardHead, Kpi, Spinner, Badge, Avatar } from '../components/ui.jsx';
import ColBars from '../components/charts/ColBars.jsx';
import Icon from '../components/Icon.jsx';
import { money, shortDateTime, shortDate } from '../format.js';

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

const ACT_ICON = { Call: 'phoneCall', Email: 'mail', Note: 'fileText', Meeting: 'users' };
const ACT_TONE = { Call: 'blue', Email: 'brand', Note: 'amber', Meeting: 'teal' };

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.dashboard().then(setData);
  }, []);

  if (!data) return <Layout title="Dashboard"><Spinner /></Layout>;

  const { kpis, submissionsByStage, upcomingInterviews, recentActivity, openJobsAging } = data;
  const stageData = STAGE_ORDER
    .map((s) => submissionsByStage.find((p) => p.stage === s))
    .filter(Boolean)
    .map((p) => ({ label: p.stage, value: p.count, color: STAGE_COLOR[p.stage] }));

  return (
    <Layout title="Dashboard">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Kpi label="Open Jobs" value={kpis.openJobs} sub="Active requisitions" tone="brand" icon="briefcase" />
        <Kpi label="Active Pipeline" value={kpis.activePipelineCandidates} sub="Candidates in motion" tone="blue" icon="candidate" />
        <Kpi label="Interviews This Week" value={kpis.interviewsThisWeek} sub="Sep 14 – Sep 20" tone="coral" icon="calendarCheck" />
        <Kpi label="Recent Placements" value={kpis.placementsRecent} sub="Since Aug 1" tone="green" icon="badge" />
        <Kpi label="Recent Revenue" value={money(kpis.revenueRecent, true)} sub="Fees + paid invoices" tone="teal" icon="receipt" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2 p-1">
          <CardHead title="Pipeline by Stage" sub="All open and closed submissions" />
          <div className="px-5 pb-5">
            <ColBars data={stageData} height={220} formatValue={(v) => v} />
          </div>
        </Card>

        <Card className="p-1">
          <CardHead title="Upcoming Interviews" sub="Scheduled and confirmed" />
          <div className="px-5 pb-4 space-y-3 max-h-[260px] overflow-y-auto">
            {upcomingInterviews.length === 0 && <p className="text-sm text-muted py-6 text-center">Nothing on the calendar.</p>}
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
          <CardHead title="Recent Activity" sub="Calls, emails and notes across the team" />
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
            {recentActivity.length === 0 && <p className="text-sm text-muted py-6 text-center">No activity logged yet.</p>}
          </div>
        </Card>

        <Card className="p-1">
          <CardHead title="Jobs Open the Longest" sub="Aging open requisitions" />
          <div className="divide-y divide-lineSoft">
            {openJobsAging.map((j) => (
              <div key={j.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{j.title}</p>
                  <p className="text-xs text-muted">{j.client_name} · opened {shortDate(j.opened_date)}</p>
                </div>
                <Badge tone={j.days_open >= 30 ? 'rose' : 'amber'}>{j.days_open} days</Badge>
              </div>
            ))}
            {openJobsAging.length === 0 && <p className="text-sm text-muted py-6 text-center">No open jobs.</p>}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
