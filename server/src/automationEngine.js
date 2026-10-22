// Automations that really run. Each rule has a trigger (what happens) and one action (notify: an entry in the
// Activity log plus an email to the person in charge when email is set up). A rule fires at most once per record
// (automation_runs has a unique key per rule + record), so a stage that goes back and forth does not spam anyone.
//
//   Event triggers  -> fire() is called by the route that changes the record.
//   Daily triggers  -> runScheduled() looks for records that crossed the line; runs hourly.
import { get, all, run } from './db.js';
import { sendNoticeEmail } from './mailer.js';
import { effectivePlan, allowsFeature } from './billing.js';

// The catalog the screen offers when creating a rule (label/description are translated on the client).
export const TRIGGERS = {
  submission_submitted: { desc: 'Submission stage is set to Submitted to Client', action: 'Notify the submission owner' },
  job_open_30d: { desc: 'A job has been open for 30 days or more', action: 'Notify the job owner' },
  interview_completed: { desc: 'Interview status is set to Completed', action: 'Remind the submission owner to follow up (3 days later)' },
  timesheet_overdue: { desc: 'Timesheet is Sent and 15 days have passed since the period ended', action: 'Mark it Overdue and notify the placement owner' },
  document_expiring: { desc: 'A candidate document expires in 30 days or less (or already expired)', action: 'Notify the candidate owner' },
  candidate_referral: { desc: 'A candidate is added with source Referral', action: 'Notify the candidate owner' },
};
export const ACTIONS = ['notify'];

const SAMPLE_DOMAIN = '@crestlinetalent.com'; // sample recruiters: never email them
const isoDay = (d = new Date()) => d.toISOString().slice(0, 10);

// Old rows only had a description: infer the trigger from its text so they start working.
export async function migrateAutomations() {
  const rows = await all(`SELECT id, trigger_desc FROM automations WHERE trigger_type IS NULL`);
  for (const r of rows) {
    const t = r.trigger_desc || '';
    const type = /Submitted to Client/i.test(t) ? 'submission_submitted'
      : /30\+ days|30 days/i.test(t) ? 'job_open_30d'
      : /Interview status/i.test(t) ? 'interview_completed'
      : /Timesheet/i.test(t) ? 'timesheet_overdue'
      : /Referral/i.test(t) ? 'candidate_referral' : null;
    if (type) await run(`UPDATE automations SET trigger_type = $1, action_type = 'notify' WHERE id = $2`, [type, r.id]);
  }
}

async function recipient(userId) {
  return userId ? get(`SELECT id, name, email FROM users WHERE id = $1`, [userId]) : null;
}

async function perform(rule, { relatedType, relatedId, ownerUserId, subject, occurredAt }) {
  const claimed = await run(
    `INSERT INTO automation_runs (automation_id, related_type, related_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`,
    [rule.id, relatedType, relatedId]
  );
  if (!claimed.rowCount) return false; // already ran for this record
  const owner = await recipient(ownerUserId) || await get(`SELECT id, name, email FROM users ORDER BY id LIMIT 1`);
  if (!owner) return true;
  await run(
    `INSERT INTO activities (type, subject, related_type, related_id, owner_user_id, occurred_at, notes) VALUES ('Automation', $1, $2, $3, $4, $5, $6)`,
    [subject, relatedType, relatedId, owner.id, occurredAt || new Date().toISOString(), `Rule: ${rule.name}`]
  );
  await run(`UPDATE automations SET last_run_at = now() WHERE id = $1`, [rule.id]);
  if (owner.email && !owner.email.endsWith(SAMPLE_DOMAIN) && process.env.AUTOMATION_EMAILS !== '0') {
    try { await sendNoticeEmail(owner.email, `[Roster] ${rule.name}`, subject); } catch (e) { console.error('automation email:', e.message); }
  }
  return true;
}

async function rulesFor(type) {
  return all(`SELECT * FROM automations WHERE active = 1 AND trigger_type = $1`, [type]);
}

// Event entry point. Never throws: an automation must not break the save that triggered it.
export async function fire(type, ctx) {
  try {
    const rules = await rulesFor(type);
    let n = 0;
    for (const rule of rules) if (await perform(rule, ctx)) n += 1;
    return n;
  } catch (e) {
    console.error('automation fire failed:', e.message);
    return 0;
  }
}

export async function runScheduled() {
  let total = 0;
  try {
    const today = isoDay();
    // Jobs open for 30+ days.
    for (const rule of await rulesFor('job_open_30d')) {
      const jobs = await all(
        `SELECT j.id, j.title, j.owner_user_id, c.company_name FROM jobs j JOIN clients c ON c.id = j.client_id
         WHERE j.status = 'Open' AND j.opened_date::date <= ($1::date - 30)`, [today]);
      for (const j of jobs) {
        if (await perform(rule, { relatedType: 'job', relatedId: j.id, ownerUserId: j.owner_user_id, subject: `Job "${j.title}" (${j.company_name}) has been open for 30+ days` })) total += 1;
      }
    }
    // Timesheets sent and unpaid for 15+ days after the period ended.
    for (const rule of await rulesFor('timesheet_overdue')) {
      const sheets = await all(
        `SELECT t.id, t.period_end, s.owner_user_id, cd.name AS candidate_name
         FROM timesheets_invoices t JOIN placements p ON p.id = t.placement_id JOIN submissions s ON s.id = p.submission_id JOIN candidates cd ON cd.id = p.candidate_id
         WHERE t.status = 'Sent' AND t.period_end::date <= ($1::date - 15)`, [today]);
      for (const t of sheets) {
        if (await perform(rule, { relatedType: 'timesheet', relatedId: t.id, ownerUserId: t.owner_user_id, subject: `Timesheet for ${t.candidate_name} (period ended ${t.period_end}) is overdue` })) {
          await run(`UPDATE timesheets_invoices SET status = 'Overdue' WHERE id = $1 AND status = 'Sent'`, [t.id]);
          total += 1;
        }
      }
    }
    // Candidate documents about to expire (Complete plan). The rule is created once, switched on, so the reminders just work.
    if (allowsFeature(await effectivePlan(), 'documents')) {
      if (!(await get(`SELECT 1 FROM automations WHERE trigger_type = 'document_expiring'`))) {
        const t = TRIGGERS.document_expiring;
        await run(`INSERT INTO automations (name, trigger_desc, action_desc, active, runs_30d, trigger_type, action_type) VALUES ('Document expiring', $1, $2, 1, 0, 'document_expiring', 'notify')`, [t.desc, t.action]);
      }
      const limit = isoDay(new Date(Date.now() + 30 * 86400000));
      for (const rule of await rulesFor('document_expiring')) {
        const docs = await all(
          `SELECT d.id, d.doc_type, d.expires_on, cd.name, cd.owner_user_id FROM candidate_documents d JOIN candidates cd ON cd.id = d.candidate_id
           WHERE d.expires_on IS NOT NULL AND d.expires_on <= $1`, [limit]);
        for (const d of docs) {
          const when = d.expires_on < today ? `expired on ${d.expires_on}` : `expires on ${d.expires_on}`;
          if (await perform(rule, { relatedType: 'document', relatedId: d.id, ownerUserId: d.owner_user_id, subject: `${d.name}: ${d.doc_type} ${when}` })) total += 1;
        }
      }
    }
  } catch (e) {
    console.error('automation scheduler failed:', e.message);
  }
  return total;
}

export function startAutomationScheduler() {
  setTimeout(() => runScheduled(), 20000).unref();
  setInterval(() => runScheduled(), 60 * 60 * 1000).unref();
}
