import { useEffect, useRef, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, CardHead, Avatar, Badge, Spinner, Button, IconButton, Field, TextInput, TextArea,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { downloadCsv } from '../csv.js';

const PROFILE_KEY = 'roster-company-profile';
const NOTIFICATIONS_KEY = 'roster-notifications-settings';
const LOGO_KEY = 'roster-company-logo';

const DEFAULT_PROFILE = {
  name: 'Crestline Talent Partners',
  address: '400 Congress Ave, Suite 1200, Austin, TX 78701',
  phone: '(512) 555-0100',
  email: 'hello@crestlinetalent.com',
  description: 'Specializing in technical and professional placements — contract, contract-to-hire and permanent, since 2016.',
};

const DEFAULT_NOTIFICATIONS = {
  newSubmissions: true,
  interviewReminders: true,
  jobAging: true,
  overdueInvoices: true,
  weeklyDigest: false,
};

const NOTIFICATION_ITEMS = [
  { key: 'newSubmissions', label: 'New submissions', desc: 'Alert me when a candidate is submitted to a client.' },
  { key: 'interviewReminders', label: 'Interview reminders', desc: 'Remind me a day before a scheduled interview.' },
  { key: 'jobAging', label: 'Job aging alerts', desc: 'Notify me when an open job passes 30 days.' },
  { key: 'overdueInvoices', label: 'Overdue invoices', desc: 'Flag timesheets/invoices that go overdue.' },
  { key: 'weeklyDigest', label: 'Weekly recruiter digest', desc: 'A Monday-morning summary of pipeline activity.' },
];

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort persistence only
  }
}

export default function Settings() {
  const [users, setUsers] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [clients, setClients] = useState([]);
  const [placements, setPlacements] = useState([]);

  const [profile, setProfile] = useState(() => loadJson(PROFILE_KEY, DEFAULT_PROFILE));
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftProfile, setDraftProfile] = useState(profile);
  const [profileSaved, setProfileSaved] = useState(false);

  const [notifications, setNotifications] = useState(() => loadJson(NOTIFICATIONS_KEY, DEFAULT_NOTIFICATIONS));

  const fileRef = useRef(null);
  const [logo, setLogo] = useState(() => {
    try {
      return localStorage.getItem(LOGO_KEY) || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    api.users().then(setUsers);
    api.candidates().then(setCandidates);
    api.jobs().then(setJobs);
    api.clients().then(setClients);
    api.placements().then(setPlacements);
  }, []);

  function startEditProfile() {
    setDraftProfile(profile);
    setEditingProfile(true);
    setProfileSaved(false);
  }

  function cancelEditProfile() {
    setEditingProfile(false);
  }

  function saveProfile() {
    setProfile(draftProfile);
    saveJson(PROFILE_KEY, draftProfile);
    setEditingProfile(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  }

  function toggleNotification(key) {
    setNotifications((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveJson(NOTIFICATIONS_KEY, next);
      return next;
    });
  }

  function onPickLogo(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setLogo(dataUrl);
      try {
        localStorage.setItem(LOGO_KEY, dataUrl);
      } catch {
        // best-effort persistence only
      }
      window.dispatchEvent(new Event('roster-logo-updated'));
    };
    reader.readAsDataURL(file);
  }

  function exportCandidates() {
    downloadCsv(
      'roster-candidates.csv',
      ['Name', 'Email', 'Phone', 'Current Title', 'Current Employer', 'Skills', 'Source', 'Owner'],
      candidates.map((c) => [c.name, c.email, c.phone, c.current_title, c.current_employer, c.skills, c.source, c.owner_name])
    );
  }
  function exportJobs() {
    downloadCsv(
      'roster-jobs.csv',
      ['Title', 'Client', 'Type', 'Pay Range', 'Location', 'Status', 'Owner'],
      jobs.map((j) => [j.title, j.client_name, j.employment_type, j.pay_range, j.location, j.status, j.owner_name])
    );
  }
  function exportClients() {
    downloadCsv(
      'roster-clients.csv',
      ['Company', 'Industry', 'Contact', 'Email', 'Phone', 'Status', 'Owner'],
      clients.map((c) => [c.company_name, c.industry, c.contact_name, c.contact_email, c.contact_phone, c.status, c.owner_name])
    );
  }
  function exportPlacements() {
    downloadCsv(
      'roster-placements.csv',
      ['Candidate', 'Client', 'Job', 'Start', 'End', 'Fee', 'Status'],
      placements.map((p) => [p.candidate_name, p.client_name, p.job_title, p.start_date, p.end_date || '', p.placement_fee, p.status])
    );
  }

  return (
    <Layout title="Settings">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-1">
          <CardHead
            title="Agency Profile"
            action={
              editingProfile ? null : (
                <IconButton icon="pencil" title="Edit profile" onClick={startEditProfile} />
              )
            }
          />
          <div className="px-5 pb-5 text-sm">
            {!editingProfile && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    title="Change logo"
                    onClick={() => fileRef.current && fileRef.current.click()}
                    className="relative flex-shrink-0 rounded-lg group"
                  >
                    {logo ? (
                      <img src={logo} alt={profile.name} width={44} height={44} className="rounded-lg object-cover w-11 h-11" />
                    ) : (
                      <span className="w-11 h-11 rounded-lg bg-brandTint text-brand flex items-center justify-center font-display font-bold">
                        {profile.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Icon name="camera" size={14} stroke="#fff" />
                      </span>
                    </span>
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
                  <p className="font-semibold text-ink">{profile.name}</p>
                </div>
                <p className="text-muted flex items-center gap-2"><Icon name="building" size={14} /> {profile.address}</p>
                <p className="text-muted flex items-center gap-2"><Icon name="phoneCall" size={14} /> {profile.phone}</p>
                <p className="text-muted flex items-center gap-2"><Icon name="mail" size={14} /> {profile.email}</p>
                <p className="text-muted flex items-center gap-2"><Icon name="target" size={14} /> {profile.description}</p>
                {profileSaved && (
                  <p className="text-sm text-green bg-greenTint border border-green/30 rounded-md px-3 py-2 flex items-center gap-1.5">
                    <Icon name="check" size={14} /> Profile saved
                  </p>
                )}
              </div>
            )}
            {editingProfile && (
              <div>
                <Field label="Company name">
                  <TextInput value={draftProfile.name} onChange={(e) => setDraftProfile((v) => ({ ...v, name: e.target.value }))} />
                </Field>
                <Field label="Address">
                  <TextInput value={draftProfile.address} onChange={(e) => setDraftProfile((v) => ({ ...v, address: e.target.value }))} />
                </Field>
                <Field label="Phone">
                  <TextInput value={draftProfile.phone} onChange={(e) => setDraftProfile((v) => ({ ...v, phone: e.target.value }))} />
                </Field>
                <Field label="Email">
                  <TextInput value={draftProfile.email} onChange={(e) => setDraftProfile((v) => ({ ...v, email: e.target.value }))} />
                </Field>
                <Field label="Description">
                  <TextArea value={draftProfile.description} onChange={(e) => setDraftProfile((v) => ({ ...v, description: e.target.value }))} />
                </Field>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={cancelEditProfile}>Cancel</Button>
                  <Button size="sm" onClick={saveProfile}>Save</Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-1">
          <CardHead title="Team" sub={users ? `${users.length} recruiters & staff` : ''} />
          <div className="divide-y divide-lineSoft max-h-[360px] overflow-y-auto">
            {!users && <Spinner />}
            {users && users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={u.name} color={u.color} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{u.name}</p>
                  <p className="text-xs text-muted">{u.email}</p>
                </div>
                <Badge tone="brand">{u.role}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-1">
          <CardHead title="Notifications" sub="Persisted locally in this browser" />
          <div className="divide-y divide-lineSoft">
            {NOTIFICATION_ITEMS.map((n) => (
              <div key={n.key} className="flex items-center justify-between px-5 py-3.5 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{n.label}</p>
                  <p className="text-xs text-muted mt-0.5">{n.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications[n.key]}
                  onClick={() => toggleNotification(n.key)}
                  className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors ${notifications[n.key] ? 'bg-brand' : 'bg-line'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${notifications[n.key] ? 'translate-x-4' : ''}`}
                  />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-1">
          <CardHead title="Data Export" sub="Download CSVs of your core records" />
          <div className="divide-y divide-lineSoft">
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ink">Candidates ({candidates.length})</span>
              <Button variant="outline" size="sm" onClick={exportCandidates}><Icon name="download" size={13} /> Export</Button>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ink">Jobs ({jobs.length})</span>
              <Button variant="outline" size="sm" onClick={exportJobs}><Icon name="download" size={13} /> Export</Button>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ink">Clients ({clients.length})</span>
              <Button variant="outline" size="sm" onClick={exportClients}><Icon name="download" size={13} /> Export</Button>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ink">Placements ({placements.length})</span>
              <Button variant="outline" size="sm" onClick={exportPlacements}><Icon name="download" size={13} /> Export</Button>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
