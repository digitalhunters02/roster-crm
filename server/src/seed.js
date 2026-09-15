import db from './db.js';

// -------------------- skip if already seeded --------------------
// The DB persists across server restarts and this script runs on every boot
// (Render start command), so only seed a fresh, empty database — never wipe
// records a user created through the app.
const alreadySeeded = db.prepare(`SELECT COUNT(*) AS n FROM clients`).get().n > 0;
if (alreadySeeded) {
  console.log('Database already has data — skipping seed.');
  process.exit(0);
}

// -------------------- users --------------------
const userRows = [
  { name: 'Maya Solano', email: 'maya.solano@crestlinetalent.com', role: 'Managing Partner', initials: 'MS', color: '#5B4EE0' },
  { name: 'Derek Chu', email: 'derek.chu@crestlinetalent.com', role: 'Senior Recruiter', initials: 'DC', color: '#2F6FE0' },
  { name: 'Priya Nair', email: 'priya.nair@crestlinetalent.com', role: 'Senior Recruiter', initials: 'PN', color: '#0E9488' },
  { name: 'Jordan Ellis', email: 'jordan.ellis@crestlinetalent.com', role: 'Account Manager', initials: 'JE', color: '#FF6B57' },
  { name: 'Sam Whitfield', email: 'sam.whitfield@crestlinetalent.com', role: 'Sourcer', initials: 'SW', color: '#C98A1D' },
  { name: 'Renata Cole', email: 'renata.cole@crestlinetalent.com', role: 'Account Manager', initials: 'RC', color: '#D1477A' },
];
const insertUser = db.prepare(`INSERT INTO users (name, email, role, initials, color) VALUES (@name, @email, @role, @initials, @color)`);
const userIds = userRows.map((r) => insertUser.run(r).lastInsertRowid);
const [MAYA, DEREK, PRIYA, JORDAN, SAM, RENATA] = userIds;

// -------------------- clients --------------------
const clientRows = [
  { company_name: 'Northwind Analytics', industry: 'Data & Analytics SaaS', contact_name: 'Grace Palmer', contact_email: 'grace.palmer@northwindanalytics.com', contact_phone: '(512) 555-0118', address: '400 Congress Ave, Austin, TX', owner_user_id: DEREK, status: 'Active', notes: 'Fast-growing SaaS shop, hires backend and data roles in bursts around funding rounds.' },
  { company_name: 'BrightPath Health', industry: 'Healthcare IT', contact_name: 'Miguel Ortiz', contact_email: 'miguel.ortiz@brightpathhealth.com', contact_phone: '(720) 555-0142', address: '1801 California St, Denver, CO', owner_user_id: PRIYA, status: 'Active', notes: 'Prefers contract-to-hire so clinical IT staff can prove out before conversion.' },
  { company_name: 'Fenwick & Cole LLP', industry: 'Legal Services', contact_name: 'Harriet Fenwick', contact_email: 'hfenwick@fenwickcole.com', contact_phone: '(312) 555-0177', address: '225 W Wacker Dr, Chicago, IL', owner_user_id: JORDAN, status: 'Active', notes: 'Long-standing client — nine placements over five years.' },
  { company_name: 'Ledger Peak Financial', industry: 'Fintech', contact_name: 'Owen Pratt', contact_email: 'owen.pratt@ledgerpeak.com', contact_phone: '(704) 555-0163', address: '128 S Tryon St, Charlotte, NC', owner_user_id: RENATA, status: 'Active', notes: 'Tight background-check turnaround required for anything client-facing.' },
  { company_name: 'Vantage Cloud Systems', industry: 'Cloud Infrastructure', contact_name: 'Elena Kowalski', contact_email: 'elena.kowalski@vantagecloud.io', contact_phone: '(206) 555-0129', address: '2001 8th Ave, Seattle, WA', owner_user_id: DEREK, status: 'Active', notes: 'Heavy contract-to-hire volume for SRE and platform roles.' },
  { company_name: 'Harborline Logistics', industry: 'Supply Chain Tech', contact_name: 'Tyrell Banks', contact_email: 'tyrell.banks@harborlinelogistics.com', contact_phone: '(404) 555-0155', address: '3355 Lenox Rd NE, Atlanta, GA', owner_user_id: JORDAN, status: 'Active', notes: 'New logo — first req just opened this quarter.' },
  { company_name: 'Meridian BioSciences', industry: 'Biotechnology', contact_name: 'Dr. Anita Roy', contact_email: 'anita.roy@meridianbio.com', contact_phone: '(617) 555-0184', address: '245 First St, Cambridge, MA', owner_user_id: PRIYA, status: 'Active', notes: 'Requires NDAs signed before resume release on anything R&D related.' },
  { company_name: 'Coastal Retail Group', industry: 'Retail Technology', contact_name: 'Felix Grant', contact_email: 'felix.grant@coastalretailgroup.com', contact_phone: '(619) 555-0136', address: '750 B St, San Diego, CA', owner_user_id: RENATA, status: 'Inactive', notes: 'Paused all hiring during a re-org; revisit next quarter.' },
  { company_name: 'Anchorpoint Insurance', industry: 'InsurTech', contact_name: 'Naomi Voss', contact_email: 'naomi.voss@anchorpointins.com', contact_phone: '(860) 555-0171', address: '90 State House Sq, Hartford, CT', owner_user_id: JORDAN, status: 'Active', notes: 'Guidewire experience is a hard requirement for claims systems roles.' },
  { company_name: 'Stratus Media Works', industry: 'Ad Tech / Media', contact_name: 'Devon Marsh', contact_email: 'devon.marsh@stratusmedia.com', contact_phone: '(212) 555-0198', address: '620 8th Ave, New York, NY', owner_user_id: DEREK, status: 'Prospect', notes: 'Intro call went well — evaluating us against two other agencies.' },
];
const insertClient = db.prepare(`INSERT INTO clients (company_name, industry, contact_name, contact_email, contact_phone, address, owner_user_id, status, notes)
  VALUES (@company_name, @industry, @contact_name, @contact_email, @contact_phone, @address, @owner_user_id, @status, @notes)`);
const clientIds = clientRows.map((r) => insertClient.run(r).lastInsertRowid);
const [C_NORTHWIND, C_BRIGHTPATH, C_FENWICK, C_LEDGERPEAK, C_VANTAGE, C_HARBORLINE, C_MERIDIAN, C_COASTAL, C_ANCHORPOINT, C_STRATUS] = clientIds;

// -------------------- jobs --------------------
const jobSeed = [
  { c: C_NORTHWIND, title: 'Senior Backend Engineer', employment_type: 'Permanent', pay_range: '$130,000 – $150,000', location: 'Austin, TX', status: 'Filled', owner: DEREK, opened: '2026-07-14', notes: 'Filled by Jasmine Whitfield — client thrilled with turnaround time.' },
  { c: C_NORTHWIND, title: 'Data Analyst', employment_type: 'Contract', pay_range: '$55 – $65 / hr', location: 'Austin, TX (Remote)', status: 'Open', owner: DEREK, opened: '2026-08-01', notes: 'Six-month initial contract, likely to extend.' },
  { c: C_BRIGHTPATH, title: 'Healthcare Systems Analyst', employment_type: 'Contract-to-Hire', pay_range: '$60 – $70 / hr', location: 'Denver, CO', status: 'Filled', owner: PRIYA, opened: '2026-07-20', notes: 'Filled by Ethan Brooks, 90-day conversion window.' },
  { c: C_BRIGHTPATH, title: 'QA Engineer', employment_type: 'Contract', pay_range: '$50 – $58 / hr', location: 'Denver, CO (Remote)', status: 'On Hold', owner: PRIYA, opened: '2026-06-10', notes: 'Client paused to finalize test plan scope.' },
  { c: C_FENWICK, title: 'Corporate Paralegal', employment_type: 'Permanent', pay_range: '$75,000 – $90,000', location: 'Chicago, IL', status: 'Filled', owner: JORDAN, opened: '2026-05-02', notes: 'Filled by Aaliyah Johnson.' },
  { c: C_FENWICK, title: 'Litigation Support Specialist', employment_type: 'Contract', pay_range: '$40 – $48 / hr', location: 'Chicago, IL', status: 'Open', owner: JORDAN, opened: '2026-08-18', notes: 'Discovery volume spiking ahead of a Q4 trial date.' },
  { c: C_LEDGERPEAK, title: 'Financial Analyst', employment_type: 'Permanent', pay_range: '$95,000 – $115,000', location: 'Charlotte, NC', status: 'Open', owner: RENATA, opened: '2026-07-28', notes: 'Reopened after the first hire left early — client wants a faster ramp this time.' },
  { c: C_LEDGERPEAK, title: 'Risk & Compliance Associate', employment_type: 'Permanent', pay_range: '$88,000 – $102,000', location: 'Charlotte, NC', status: 'Cancelled', owner: RENATA, opened: '2026-06-15', notes: 'Headcount pulled after Q2 budget freeze.' },
  { c: C_VANTAGE, title: 'Cloud Solutions Architect', employment_type: 'Permanent', pay_range: '$150,000 – $175,000', location: 'Seattle, WA', status: 'Open', owner: DEREK, opened: '2026-08-05', notes: 'CTO is the sole approver — expect a fast final round once shortlisted.' },
  { c: C_VANTAGE, title: 'Site Reliability Engineer', employment_type: 'Contract-to-Hire', pay_range: '$70 – $80 / hr', location: 'Seattle, WA (Remote)', status: 'Filled', owner: DEREK, opened: '2026-08-22', notes: 'Filled by Fatima Al-Sayed.' },
  { c: C_HARBORLINE, title: 'Supply Chain Analyst', employment_type: 'Permanent', pay_range: '$80,000 – $95,000', location: 'Atlanta, GA', status: 'Open', owner: JORDAN, opened: '2026-08-29', notes: 'First req from a brand-new logo — prioritize a clean intake.' },
  { c: C_MERIDIAN, title: 'Bioinformatics Scientist', employment_type: 'Permanent', pay_range: '$105,000 – $125,000', location: 'Boston, MA', status: 'Open', owner: PRIYA, opened: '2026-07-09', notes: 'NDA required before any resumes go out.' },
  { c: C_ANCHORPOINT, title: 'Claims Systems Analyst', employment_type: 'Contract', pay_range: '$52 – $60 / hr', location: 'Hartford, CT', status: 'Filled', owner: JORDAN, opened: '2026-05-20', notes: 'Filled by Hannah Kim — contract completed end of August.' },
  { c: C_ANCHORPOINT, title: 'IT Support Specialist', employment_type: 'Permanent', pay_range: '$58,000 – $68,000', location: 'Hartford, CT', status: 'Open', owner: JORDAN, opened: '2026-08-11', notes: 'Entry-level friendly — Guidewire exposure is a plus, not required.' },
  { c: C_STRATUS, title: 'Ad Ops Manager', employment_type: 'Permanent', pay_range: '$90,000 – $108,000', location: 'New York, NY (Remote)', status: 'On Hold', owner: DEREK, opened: '2026-06-25', notes: 'On hold while Stratus finalizes agency selection.' },
  { c: C_NORTHWIND, title: 'Full Stack Developer', employment_type: 'Contract', pay_range: '$60 – $70 / hr', location: 'Austin, TX (Remote)', status: 'Open', owner: DEREK, opened: '2026-08-14', notes: 'Greenfield internal tools rebuild.' },
];
const insertJob = db.prepare(`INSERT INTO jobs (client_id, title, employment_type, pay_range, location, status, owner_user_id, opened_date, notes)
  VALUES (@client_id, @title, @employment_type, @pay_range, @location, @status, @owner_user_id, @opened_date, @notes)`);
const jobIds = jobSeed.map((j) => insertJob.run({
  client_id: j.c, title: j.title, employment_type: j.employment_type, pay_range: j.pay_range, location: j.location,
  status: j.status, owner_user_id: j.owner, opened_date: j.opened, notes: j.notes,
}).lastInsertRowid);
const [J_BACKEND, J_DATA_ANALYST, J_HEALTH_SYS, J_QA, J_PARALEGAL, J_LITIGATION, J_FIN_ANALYST, J_RISK, J_CLOUD_ARCH, J_SRE, J_SUPPLY_CHAIN, J_BIOINFORMATICS, J_CLAIMS, J_IT_SUPPORT, J_ADOPS, J_FULLSTACK] = jobIds;

// -------------------- candidates --------------------
const candidateSeed = [
  { name: 'Jasmine Whitfield', title: 'Senior Backend Engineer', employer: 'Pinewood Systems', skills: 'Python, Django, PostgreSQL, AWS', summary: '7 years building high-throughput payment services; led a team of four at Pinewood.', source: 'LinkedIn', owner: DEREK, created: '2026-07-10' },
  { name: 'Diego Alvarez Marín', title: 'Data Analyst', employer: 'Quillfield Co', skills: 'SQL, Tableau, Python, dbt', summary: 'Builds exec-facing dashboards; strong SQL optimization background.', source: 'Referral', owner: SAM, created: '2026-08-10' },
  { name: 'Wei Chen', title: 'DevOps Engineer', employer: 'Northlake Systems', skills: 'Kubernetes, Terraform, AWS, CI/CD', summary: 'Migrated Northlake\'s infra to EKS; comfortable on-call lead.', source: 'Job Board', owner: DEREK, created: '2026-07-30' },
  { name: 'Aaliyah Johnson', title: 'Corporate Paralegal', employer: 'Bramwell & Voss', skills: 'Litigation Support, Contract Review, Westlaw', summary: 'Six years supporting M&A transactions at a mid-size firm.', source: 'Referral', owner: JORDAN, created: '2026-05-01' },
  { name: 'Sanjay Patel', title: 'Financial Analyst', employer: 'Cordage Capital', skills: 'Financial Modeling, Excel, SQL, FP&A', summary: 'FP&A generalist with a knack for board-deck-ready models.', source: 'LinkedIn', owner: RENATA, created: '2026-08-05' },
  { name: 'Emily Novak', title: 'QA Engineer', employer: 'Fenbrook Software', skills: 'Selenium, Cypress, Test Automation, Agile', summary: 'Built Fenbrook\'s first automated regression suite from scratch.', source: 'Job Board', owner: PRIYA, created: '2026-08-20' },
  { name: 'Carlos Mendoza', title: 'Cloud Solutions Architect', employer: 'Steelbridge Cloud', skills: 'AWS, Azure, Architecture, Kubernetes', summary: 'Multi-cloud architect, ex-AWS Professional Services.', source: 'Sourced', owner: DEREK, created: '2026-08-20' },
  { name: 'Fatima Al-Sayed', title: 'Site Reliability Engineer', employer: 'Marrow Data', skills: 'SRE, Go, Prometheus, AWS', summary: 'Owns Marrow\'s SLOs end to end; wrote their incident-response playbook.', source: 'LinkedIn', owner: DEREK, created: '2026-07-25' },
  { name: "Liam O'Connor", title: 'Supply Chain Analyst', employer: 'Driftwood Logistics', skills: 'Supply Chain, SQL, Power BI', summary: 'Cut Driftwood\'s stockout rate 18% through demand forecasting.', source: 'Referral', owner: JORDAN, created: '2026-08-25' },
  { name: 'Ngozi Adeyemi', title: 'Bioinformatics Scientist', employer: 'Helix Bio Labs', skills: 'Python, R, Genomics, NGS', summary: 'Published on NGS variant-calling pipelines; PhD in computational biology.', source: 'Job Board', owner: PRIYA, created: '2026-08-01' },
  { name: 'Hannah Kim', title: 'Claims Systems Analyst', employer: 'Ridgeline Insurance', skills: 'Guidewire, SQL, Claims Systems', summary: 'Guidewire ClaimCenter configuration specialist, 5 years.', source: 'Sourced', owner: JORDAN, created: '2026-05-10' },
  { name: 'Marcus Delgado', title: 'IT Support Specialist', employer: 'Fielding Retail', skills: 'Help Desk, Windows Admin, ServiceNow', summary: 'Tier 2 support lead, strong ServiceNow ticketing background.', source: 'Job Board', owner: JORDAN, created: '2026-08-24' },
  { name: 'Sofia Petrova', title: 'Ad Ops Manager', employer: 'Brightline Media', skills: 'Ad Ops, Google Ad Manager, Analytics', summary: 'Ran programmatic ad ops for a 40M-pageview media property.', source: 'LinkedIn', owner: DEREK, created: '2026-06-28' },
  { name: 'Ethan Brooks', title: 'Healthcare Systems Analyst', employer: 'CareSync Health', skills: 'HL7, Epic, SQL, Healthcare IT', summary: 'Epic-certified analyst with hospital-system integration experience.', source: 'Referral', owner: PRIYA, created: '2026-07-18' },
  { name: 'Priyanka Rao', title: 'Full Stack Developer', employer: 'Tandem Labs', skills: 'React, Node.js, TypeScript, GraphQL', summary: 'Shipped Tandem\'s internal tools platform end to end solo.', source: 'LinkedIn', owner: SAM, created: '2026-08-22' },
  { name: 'Tobias Lindqvist', title: 'Backend Engineer', employer: 'Nordkap Systems', skills: 'Java, Spring Boot, Kafka, AWS', summary: 'Event-driven systems background; strong Kafka depth.', source: 'Sourced', owner: DEREK, created: '2026-07-15' },
  { name: 'Camila Rocha', title: 'Risk & Compliance Associate', employer: 'Fortress Financial', skills: 'Risk Management, Compliance, SQL', summary: 'SOX compliance and enterprise risk reporting background.', source: 'Job Board', owner: RENATA, created: '2026-02-20' },
  { name: 'Andre Beaumont', title: 'Litigation Support Specialist', employer: 'Sterling Legal Group', skills: 'eDiscovery, Relativity, Legal Research', summary: 'Relativity-certified, handled document review for two federal cases.', source: 'Referral', owner: JORDAN, created: '2026-08-15' },
];
const insertCandidate = db.prepare(`INSERT INTO candidates (name, email, phone, current_title, current_employer, skills, resume_summary, source, owner_user_id, created_at)
  VALUES (@name, @email, @phone, @current_title, @current_employer, @skills, @resume_summary, @source, @owner_user_id, @created_at)`);
const candidateIds = candidateSeed.map((c, i) => {
  const parts = c.name.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
  const email = `${parts[0]}.${parts[parts.length - 1]}@personalmail.com`;
  const phone = `(${512 + (i % 8) * 3}) 555-0${100 + i * 3}`;
  return insertCandidate.run({
    name: c.name, email, phone, current_title: c.title, current_employer: c.employer, skills: c.skills,
    resume_summary: c.summary, source: c.source, owner_user_id: c.owner, created_at: c.created,
  }).lastInsertRowid;
});
const [
  CAND_JASMINE, CAND_DIEGO, CAND_WEI, CAND_AALIYAH, CAND_SANJAY, CAND_EMILY, CAND_CARLOS, CAND_FATIMA,
  CAND_LIAM, CAND_NGOZI, CAND_HANNAH, CAND_MARCUS, CAND_SOFIA, CAND_ETHAN, CAND_PRIYANKA, CAND_TOBIAS,
  CAND_CAMILA, CAND_ANDRE,
] = candidateIds;

// -------------------- submissions --------------------
const submissionSeed = [
  { cand: CAND_JASMINE, job: J_BACKEND, stage: 'Placed', owner: DEREK, date: '2026-07-18', notes: 'Client fast-tracked after a strong take-home exercise.' },
  { cand: CAND_TOBIAS, job: J_BACKEND, stage: 'Client Interview', owner: DEREK, date: '2026-07-20', notes: 'Runner-up — kept warm for backfill or the new Full Stack req.' },
  { cand: CAND_WEI, job: J_SRE, stage: 'Submitted to Client', owner: DEREK, date: '2026-08-05', notes: 'Client ultimately selected another finalist.' },
  { cand: CAND_FATIMA, job: J_SRE, stage: 'Placed', owner: DEREK, date: '2026-08-10', notes: null },
  { cand: CAND_DIEGO, job: J_DATA_ANALYST, stage: 'Screened', owner: SAM, date: '2026-08-15', notes: 'Strong SQL screen, scheduling client submission.' },
  { cand: CAND_PRIYANKA, job: J_FULLSTACK, stage: 'Submitted to Client', owner: SAM, date: '2026-08-28', notes: null },
  { cand: CAND_AALIYAH, job: J_PARALEGAL, stage: 'Placed', owner: JORDAN, date: '2026-05-10', notes: null },
  { cand: CAND_ANDRE, job: J_LITIGATION, stage: 'Client Interview', owner: JORDAN, date: '2026-08-22', notes: 'Interview scheduled for next week.' },
  { cand: CAND_SANJAY, job: J_FIN_ANALYST, stage: 'Offer', owner: RENATA, date: '2026-08-18', notes: 'Verbal offer extended, awaiting written acceptance.' },
  { cand: CAND_CAMILA, job: J_RISK, stage: 'Rejected', owner: RENATA, date: '2026-07-01', notes: 'Role cancelled by client before a decision was made.' },
  { cand: CAND_CARLOS, job: J_CLOUD_ARCH, stage: 'Client Interview', owner: DEREK, date: '2026-08-27', notes: null },
  { cand: CAND_WEI, job: J_CLOUD_ARCH, stage: 'Sourced', owner: DEREK, date: '2026-09-02', notes: null },
  { cand: CAND_LIAM, job: J_SUPPLY_CHAIN, stage: 'Submitted to Client', owner: JORDAN, date: '2026-09-03', notes: null },
  { cand: CAND_NGOZI, job: J_BIOINFORMATICS, stage: 'Client Interview', owner: PRIYA, date: '2026-08-12', notes: null },
  { cand: CAND_ETHAN, job: J_HEALTH_SYS, stage: 'Placed', owner: PRIYA, date: '2026-07-25', notes: null },
  { cand: CAND_EMILY, job: J_QA, stage: 'Screened', owner: PRIYA, date: '2026-08-30', notes: 'On hold pending client scope finalization.' },
  { cand: CAND_HANNAH, job: J_CLAIMS, stage: 'Placed', owner: JORDAN, date: '2026-05-15', notes: null },
  { cand: CAND_MARCUS, job: J_IT_SUPPORT, stage: 'Submitted to Client', owner: JORDAN, date: '2026-08-29', notes: null },
  { cand: CAND_SOFIA, job: J_ADOPS, stage: 'Withdrawn', owner: DEREK, date: '2026-07-05', notes: 'Candidate accepted another offer.' },
  { cand: CAND_TOBIAS, job: J_SRE, stage: 'Rejected', owner: DEREK, date: '2026-08-14', notes: 'Not enough hands-on SRE experience for this req.' },
  { cand: CAND_DIEGO, job: J_SUPPLY_CHAIN, stage: 'Sourced', owner: JORDAN, date: '2026-09-05', notes: null },
  { cand: CAND_FATIMA, job: J_CLOUD_ARCH, stage: 'Sourced', owner: DEREK, date: '2026-09-08', notes: null },
  { cand: CAND_CAMILA, job: J_FIN_ANALYST, stage: 'Placed', owner: RENATA, date: '2026-03-01', notes: 'Earlier hire for this req — left early, role since reopened.' },
];
const insertSubmission = db.prepare(`INSERT INTO submissions (candidate_id, job_id, stage, owner_user_id, submitted_date, notes)
  VALUES (@candidate_id, @job_id, @stage, @owner_user_id, @submitted_date, @notes)`);
const submissionIds = submissionSeed.map((s) => insertSubmission.run({
  candidate_id: s.cand, job_id: s.job, stage: s.stage, owner_user_id: s.owner, submitted_date: s.date, notes: s.notes,
}).lastInsertRowid);

// -------------------- interviews --------------------
const interviewSeed = [
  { sub: submissionIds[1], interviewer: 'Derek Chu', at: '2026-07-22T10:00', type: 'Phone Screen', status: 'Completed', notes: null },
  { sub: submissionIds[1], interviewer: 'Grace Palmer', at: '2026-08-05T14:00', type: 'Client Interview', status: 'Completed', notes: 'Positive feedback but Jasmine was further along.' },
  { sub: submissionIds[0], interviewer: 'Grace Palmer', at: '2026-07-28T11:00', type: 'Final Round', status: 'Completed', notes: 'Offer approved same day.' },
  { sub: submissionIds[7], interviewer: 'Harriet Fenwick', at: '2026-09-16T13:00', type: 'Client Interview', status: 'Scheduled', notes: null },
  { sub: submissionIds[10], interviewer: 'Elena Kowalski', at: '2026-09-17T15:30', type: 'Client Interview', status: 'Scheduled', notes: null },
  { sub: submissionIds[13], interviewer: 'Dr. Anita Roy', at: '2026-08-19T09:00', type: 'Client Interview', status: 'Completed', notes: 'Moving to a final round.' },
  { sub: submissionIds[8], interviewer: 'Owen Pratt', at: '2026-09-18T10:30', type: 'Final Round', status: 'Scheduled', notes: null },
  { sub: submissionIds[17], interviewer: 'Jordan Ellis', at: '2026-09-05T09:30', type: 'Phone Screen', status: 'No-show', notes: 'Rescheduling for next week.' },
  { sub: submissionIds[5], interviewer: 'Sam Whitfield', at: '2026-09-03T16:00', type: 'Phone Screen', status: 'Completed', notes: null },
  { sub: submissionIds[12], interviewer: 'Tyrell Banks', at: '2026-09-20T11:00', type: 'Client Interview', status: 'Scheduled', notes: null },
  { sub: submissionIds[2], interviewer: 'Elena Kowalski', at: '2026-08-12T13:00', type: 'Client Interview', status: 'Cancelled', notes: 'Client rescheduled internally and never re-booked.' },
];
const insertInterview = db.prepare(`INSERT INTO interviews (submission_id, interviewer_name, scheduled_at, type, status, notes)
  VALUES (@submission_id, @interviewer_name, @scheduled_at, @type, @status, @notes)`);
interviewSeed.forEach((i) => insertInterview.run({
  submission_id: i.sub, interviewer_name: i.interviewer, scheduled_at: i.at, type: i.type, status: i.status, notes: i.notes,
}));

// -------------------- placements --------------------
const placementSeed = [
  { sub: submissionIds[0], cand: CAND_JASMINE, client: C_NORTHWIND, job: J_BACKEND, start: '2026-08-03', end: null, pay: 140000, bill: 0, fee: 28000, status: 'Active' },
  { sub: submissionIds[3], cand: CAND_FATIMA, client: C_VANTAGE, job: J_SRE, start: '2026-08-15', end: null, pay: 75, bill: 95, fee: 6000, status: 'Active' },
  { sub: submissionIds[6], cand: CAND_AALIYAH, client: C_FENWICK, job: J_PARALEGAL, start: '2026-05-18', end: null, pay: 82000, bill: 0, fee: 16400, status: 'Active' },
  { sub: submissionIds[14], cand: CAND_ETHAN, client: C_BRIGHTPATH, job: J_HEALTH_SYS, start: '2026-08-04', end: null, pay: 65, bill: 82, fee: 5200, status: 'Active' },
  { sub: submissionIds[16], cand: CAND_HANNAH, client: C_ANCHORPOINT, job: J_CLAIMS, start: '2026-06-02', end: '2026-08-31', pay: 55, bill: 70, fee: 4800, status: 'Completed' },
  { sub: submissionIds[22], cand: CAND_CAMILA, client: C_LEDGERPEAK, job: J_FIN_ANALYST, start: '2026-03-10', end: '2026-05-20', pay: 98000, bill: 0, fee: 19600, status: 'Ended Early' },
];
const insertPlacement = db.prepare(`INSERT INTO placements (submission_id, candidate_id, client_id, job_id, start_date, end_date, pay_rate, bill_rate, placement_fee, status)
  VALUES (@submission_id, @candidate_id, @client_id, @job_id, @start_date, @end_date, @pay_rate, @bill_rate, @placement_fee, @status)`);
const placementIds = placementSeed.map((p) => insertPlacement.run({
  submission_id: p.sub, candidate_id: p.cand, client_id: p.client, job_id: p.job, start_date: p.start, end_date: p.end,
  pay_rate: p.pay, bill_rate: p.bill, placement_fee: p.fee, status: p.status,
}).lastInsertRowid);
const [P_JASMINE, P_FATIMA, P_AALIYAH, P_ETHAN, P_HANNAH, P_CAMILA] = placementIds;

// -------------------- timesheets_invoices --------------------
const timesheetSeed = [
  { placement: P_FATIMA, start: '2026-08-15', end: '2026-08-28', hours: 80, rate: 95, status: 'Paid' },
  { placement: P_FATIMA, start: '2026-08-29', end: '2026-09-11', hours: 80, rate: 95, status: 'Sent' },
  { placement: P_FATIMA, start: '2026-09-12', end: '2026-09-25', hours: 40, rate: 95, status: 'Draft' },
  { placement: P_ETHAN, start: '2026-08-04', end: '2026-08-17', hours: 80, rate: 82, status: 'Paid' },
  { placement: P_ETHAN, start: '2026-08-18', end: '2026-08-31', hours: 80, rate: 82, status: 'Paid' },
  { placement: P_ETHAN, start: '2026-09-01', end: '2026-09-14', hours: 80, rate: 82, status: 'Overdue' },
  { placement: P_HANNAH, start: '2026-07-28', end: '2026-08-10', hours: 80, rate: 70, status: 'Paid' },
  { placement: P_HANNAH, start: '2026-08-11', end: '2026-08-24', hours: 80, rate: 70, status: 'Paid' },
  { placement: P_HANNAH, start: '2026-08-25', end: '2026-08-31', hours: 28, rate: 70, status: 'Paid' },
];
const insertTimesheet = db.prepare(`INSERT INTO timesheets_invoices (placement_id, period_start, period_end, hours, amount, status)
  VALUES (@placement_id, @period_start, @period_end, @hours, @amount, @status)`);
timesheetSeed.forEach((t) => insertTimesheet.run({
  placement_id: t.placement, period_start: t.start, period_end: t.end, hours: t.hours,
  amount: Math.round(t.hours * t.rate * 100) / 100, status: t.status,
}));

// -------------------- activities --------------------
const activitySeed = [
  { type: 'Call', subject: "Checked in with Jasmine on start-date logistics", related_type: 'candidate', related_id: CAND_JASMINE, owner: DEREK, at: '2026-08-01T09:15', notes: null },
  { type: 'Email', subject: 'Sent updated rate confirmation to Northwind Analytics', related_type: 'client', related_id: C_NORTHWIND, owner: DEREK, at: '2026-07-30T16:40', notes: null },
  { type: 'Note', subject: "Grace Palmer confirmed Jasmine's start date is firm", related_type: 'job', related_id: J_BACKEND, owner: DEREK, at: '2026-08-02T11:05', notes: null },
  { type: 'Call', subject: 'Debrief call with Andre after client interview prep', related_type: 'submission', related_id: submissionIds[7], owner: JORDAN, at: '2026-08-21T14:20', notes: null },
  { type: 'Email', subject: 'Followed up with Harriet Fenwick on paralegal headcount', related_type: 'client', related_id: C_FENWICK, owner: JORDAN, at: '2026-08-19T10:00', notes: null },
  { type: 'Meeting', subject: 'Kickoff call for new Cloud Architect req', related_type: 'job', related_id: J_CLOUD_ARCH, owner: DEREK, at: '2026-08-06T13:30', notes: null },
  { type: 'Call', subject: 'Reference check for Ethan Brooks', related_type: 'candidate', related_id: CAND_ETHAN, owner: PRIYA, at: '2026-07-28T15:45', notes: 'Both references strongly positive.' },
  { type: 'Note', subject: 'Ngozi rescheduled interview prep call', related_type: 'candidate', related_id: CAND_NGOZI, owner: PRIYA, at: '2026-08-15T08:50', notes: null },
  { type: 'Email', subject: "Sent Sanjay's updated resume to Ledger Peak", related_type: 'submission', related_id: submissionIds[8], owner: RENATA, at: '2026-08-19T09:30', notes: null },
  { type: 'Call', subject: 'Checked in with Owen Pratt on financial analyst timeline', related_type: 'client', related_id: C_LEDGERPEAK, owner: RENATA, at: '2026-08-22T12:00', notes: null },
  { type: 'Note', subject: "Camila's exit interview notes filed", related_type: 'placement', related_id: P_CAMILA, owner: RENATA, at: '2026-05-21T10:15', notes: 'Departure was amicable — open to referrals from her.' },
  { type: 'Call', subject: 'Weekly sync with Tyrell Banks on Supply Chain req', related_type: 'client', related_id: C_HARBORLINE, owner: JORDAN, at: '2026-09-04T11:00', notes: null },
  { type: 'Email', subject: 'Sent offer packet to Sanjay Patel', related_type: 'submission', related_id: submissionIds[8], owner: RENATA, at: '2026-09-10T09:00', notes: null },
  { type: 'Note', subject: 'Sourced two new backend candidates for Northwind pipeline', related_type: 'job', related_id: J_BACKEND, owner: SAM, at: '2026-08-28T17:10', notes: null },
  { type: 'Call', subject: 'Checked in with Fatima on week-one onboarding', related_type: 'placement', related_id: P_FATIMA, owner: DEREK, at: '2026-08-20T10:30', notes: null },
];
const insertActivity = db.prepare(`INSERT INTO activities (type, subject, related_type, related_id, owner_user_id, occurred_at, notes)
  VALUES (@type, @subject, @related_type, @related_id, @owner_user_id, @occurred_at, @notes)`);
activitySeed.forEach((a) => insertActivity.run({
  type: a.type, subject: a.subject, related_type: a.related_type, related_id: a.related_id,
  owner_user_id: a.owner, occurred_at: a.at, notes: a.notes,
}));

// -------------------- automations --------------------
const automationRows = [
  { name: 'Notify recruiter when a candidate is submitted', trigger_desc: 'Submission stage is set to Submitted to Client', action_desc: 'Send a Slack and email alert to the submission owner', active: 1, runs_30d: 34 },
  { name: 'Alert account manager when a job has been open 30+ days', trigger_desc: 'Job opened_date is 30+ days ago and status is still Open', action_desc: 'Notify the job owner and flag it on the Jobs board', active: 1, runs_30d: 9 },
  { name: 'Remind recruiter to follow up 3 days after an interview', trigger_desc: 'Interview status is set to Completed', action_desc: 'Create a follow-up reminder for the submission owner three days later', active: 1, runs_30d: 21 },
  { name: 'Flag overdue timesheets', trigger_desc: 'Timesheet status is Sent and 15 days have passed since period_end', action_desc: 'Mark the timesheet Overdue and notify accounts receivable', active: 1, runs_30d: 6 },
  { name: 'Auto-tag referral candidates as high priority', trigger_desc: 'Candidate source is Referral', action_desc: 'Set a priority flag and notify the sourcing team', active: 0, runs_30d: 0 },
];
const insertAutomation = db.prepare(`INSERT INTO automations (name, trigger_desc, action_desc, active, runs_30d)
  VALUES (@name, @trigger_desc, @action_desc, @active, @runs_30d)`);
automationRows.forEach((r) => insertAutomation.run(r));

console.log(`Seeded: ${userIds.length} users, ${clientIds.length} clients, ${jobIds.length} jobs, ${candidateIds.length} candidates, ${submissionIds.length} submissions, ${interviewSeed.length} interviews, ${placementIds.length} placements, ${timesheetSeed.length} timesheets/invoices, ${activitySeed.length} activities, ${automationRows.length} automations.`);
