import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api, { BASE } from '../api.js';
import Layout from '../components/Layout.jsx';
import {
  Card, CardHead, Avatar, Badge, Spinner, Button, IconButton, Field, TextInput, TextArea, Modal, FormError,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { downloadCsv } from '../csv.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { MyAccountCard, StaffCard } from '../auth/AccountPanel.jsx';
import { usePlan } from '../plans/PlanContext.jsx';
import PlanBadge, { usePlanGate } from '../planKit/PlanBadge.jsx';
import { gateText, planStr } from '../planKit/planStrings.js';
import { useT } from '../auth/i18n.js';

function CareersLinkCard() {
  const { allows } = usePlan();
  const { t, lang } = useT();
  const gate = usePlanGate('careers');
  const on = allows('careers');
  const url = `${window.location.origin}/#/careers`;
  const [copied, setCopied] = useState(false);
  return (
    <Card className="p-1" data-testid="careers-card">
      <CardHead title={t('Careers page')} sub={t('A public page listing your open jobs. Applicants land in the pipeline as Sourced.')} />
      <div className="px-4 pb-4">
        {on ? (
          <>
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label={t('Careers page link')} className="w-full rounded-lg border border-line bg-wash px-3 py-2 text-xs text-ink" />
            <div className="mt-2 flex gap-2">
              <Button variant="brand" size="sm" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => {})}>{copied ? t('Copied') : t('Copy link')}</Button>
              <a className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-wash" href={url} target="_blank" rel="noreferrer">{t('Open page')}</a>
            </div>
          </>
        ) : (
          // Selo de plano: o que o recurso faz + selo do plano mínimo; o botão abre a janelinha "Disponível no plano X".
          <div data-plan-notice="careers" className="flex flex-wrap items-center gap-3">
            <p className="flex-1 min-w-[200px] text-sm text-muted m-0">{gateText('careers', lang).what}<PlanBadge gate="careers" /></p>
            <button type="button" onClick={gate.open} data-testid="careers-locked-open" className="inline-flex items-center min-h-[40px] px-3 rounded-lg border border-line bg-surface text-sm font-semibold text-ink hover:bg-wash">{planStr(lang).details}</button>
          </div>
        )}
      </div>
    </Card>
  );
}

import PlanCard from '../billing/PlanCard.jsx';
import { OfficesCard, ConnectionsCard, DeveloperCard } from '../components/CompleteSettings.jsx';
import RexConnectorCard from '../components/RexConnectorCard.jsx';
import { useProfile, saveProfile } from '../profile/useProfile.js';
function SmsConnectForm({ webhookUrl, onClose, onConnected }) {
  const { t } = useT();
  const [v, setV] = useState({ account_sid: '', auth_token: '', from_number: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  async function submit() {
    setBusy(true); setError(null);
    try { await api.smsConnect(v); onConnected(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal
      title={t('Connect SMS (Twilio)')}
      sub={t('Texts are sent from your own Twilio account and number, so the cost and the sender are yours.')}
      onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={busy}>{t('Cancel')}</Button>
        <Button onClick={submit} disabled={busy || !v.account_sid || !v.auth_token || !v.from_number} data-testid="sms-connect-save">{busy ? t('Connecting…') : t('Connect')}</Button>
      </>}
    >
      <FormError error={error} />
      <Field label={t('Account SID')} required hint={t('Starts with AC. Find it on your Twilio console home page.')}>
        <TextInput value={v.account_sid} onChange={set('account_sid')} placeholder="AC…" autoComplete="off" data-testid="sms-sid" />
      </Field>
      <Field label={t('Auth Token')} required hint={t('Stored encrypted and never shown again.')}>
        <TextInput type="password" value={v.auth_token} onChange={set('auth_token')} autoComplete="new-password" data-testid="sms-token" />
      </Field>
      <Field label={t('Twilio phone number')} required>
        <TextInput value={v.from_number} onChange={set('from_number')} placeholder="+15125550123" data-testid="sms-from" />
      </Field>
      <Field label={t('Reply webhook')} hint={t('In Twilio, set this as “A message comes in” for your number so replies and STOP show up here.')}>
        <TextInput readOnly value={webhookUrl || ''} onFocus={(e) => e.target.select()} />
      </Field>
    </Modal>
  );
}

const WHATSAPP_WEBHOOK_URL = `${BASE}/integrations/whatsapp/webhook`;

function WhatsAppConnectForm({ onClose, onConnected }) {
  const { t } = useT();
  const [form, setForm] = useState({ phoneNumberId: '', accessToken: '', businessAccountId: '', verifyToken: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function set(key) {
    return (e) => setForm((v) => ({ ...v, [key]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.phoneNumberId.trim() || !form.accessToken.trim()) {
      setError('Phone Number ID and Access Token are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.whatsappConnect({
        phoneNumberId: form.phoneNumberId.trim(),
        accessToken: form.accessToken.trim(),
        businessAccountId: form.businessAccountId.trim() || undefined,
        verifyToken: form.verifyToken.trim() || undefined,
      });
      onConnected(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t('Connect WhatsApp')}
      sub={t('Paste credentials from Meta\'s developer console for your WhatsApp Business number.')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t('Cancel')}</Button>
          <Button onClick={submit} disabled={busy}>{busy ? t('Connecting…') : t('Connect')}</Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <FormError error={error} />
        <Field label={t('Phone Number ID')} required hint={t('From Meta\'s WhatsApp > API Setup page.')}>
          <TextInput value={form.phoneNumberId} onChange={set('phoneNumberId')} placeholder="e.g. 109876543210987" />
        </Field>
        <Field label={t('Access Token')} required hint={t('A permanent (system user) token is recommended over a 24-hour test token.')}>
          <TextInput type="password" value={form.accessToken} onChange={set('accessToken')} placeholder={t('EAAG...')} />
        </Field>
        <Field label={t('Business Account ID')} hint={t('Optional — WhatsApp Business Account (WABA) ID.')}>
          <TextInput value={form.businessAccountId} onChange={set('businessAccountId')} />
        </Field>
        <Field label={t('Verify Token')} hint={t('Optional — a string you choose and also paste into Meta\'s webhook setup, below.')}>
          <TextInput value={form.verifyToken} onChange={set('verifyToken')} placeholder={t('e.g. roster-verify')} />
        </Field>
        <div className="rounded-md border border-line bg-wash px-3 py-2.5 mt-1">
          <p className="text-xs font-semibold text-muted mb-1">{t('Webhook callback URL')}</p>
          <p className="text-xs text-ink break-all font-mono">{WHATSAPP_WEBHOOK_URL}</p>
          <p className="text-xs text-faint mt-1.5">{t('Paste this — plus the Verify Token above — into Meta\'s WhatsApp > Configuration > Webhook setup.')}</p>
        </div>
      </form>
    </Modal>
  );
}

export default function Settings() {
  const { t, lang } = useT();
  const { account } = useAuth();
  const waGate = usePlanGate('whatsapp'); // Selo de plano: o cartão do WhatsApp continua aqui; sem o plano, o botão ganha o selo e abre a janelinha
  const smsGate = usePlanGate('messaging'); // idem para o SMS (Twilio)
  const [users, setUsers] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [clients, setClients] = useState([]);
  const [placements, setPlacements] = useState([]);

  const profile = useProfile();
  const logo = profile.logo || null;
  const owner = account?.role === 'owner';
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftProfile, setDraftProfile] = useState(profile);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [smsStatus, setSmsStatus] = useState(null);
  const [smsModal, setSmsModal] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);
  const refreshSms = () => api.smsStatus().then(setSmsStatus).catch(() => setSmsStatus({ connected: false }));
  async function disconnectSms() {
    setSmsBusy(true);
    try { await api.smsDisconnect(); await refreshSms(); } finally { setSmsBusy(false); }
  }

  const [waStatus, setWaStatus] = useState(null);
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waBusy, setWaBusy] = useState(false);

  function refreshWhatsAppStatus() {
    api.whatsappStatus().then(setWaStatus);
  }

  async function disconnectWhatsApp() {
    setWaBusy(true);
    try {
      await api.whatsappDisconnect();
      refreshWhatsAppStatus();
    } finally {
      setWaBusy(false);
    }
  }

  function onWhatsAppConnected() {
    setWaModalOpen(false);
    refreshWhatsAppStatus();
  }

  const fileRef = useRef(null);

  // "See plans" (from the plan window or a locked page) arrives with ?plan=1: scroll to the plan card, also when Settings is already open.
  const location = useLocation();
  useEffect(() => {
    if (!/[?&]plan=1/.test(location.search)) return undefined;
    const id = setTimeout(() => document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    return () => clearTimeout(id);
  }, [location.search]);

  useEffect(() => {
    api.users().then(setUsers);
    api.candidates().then(setCandidates);
    api.jobs().then(setJobs);
    api.clients().then(setClients);
    api.placements().then(setPlacements);
    refreshWhatsAppStatus();
    refreshSms();
  }, []);

  function startEditProfile() {
    setDraftProfile(profile);
    setEditingProfile(true);
    setProfileSaved(false);
  }

  function cancelEditProfile() {
    setEditingProfile(false);
  }

  async function submitProfile() {
    setProfileError('');
    try {
      const { name, address, phone, email, description, payment_url, payment_note } = draftProfile;
      await saveProfile({ name, address, phone, email, description, payment_url, payment_note });
      setEditingProfile(false);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (e) {
      setProfileError(e.status === 400 ? e.message : t('Only the account owner can change the agency profile.'));
    }
  }

  function onPickLogo(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 300 * 1024) { setProfileError(t('The logo must be a PNG, JPEG or WebP image under 300 KB.')); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try { await saveProfile({ logo: reader.result }); setProfileError(''); }
      catch { setProfileError(t('Only the account owner can change the agency profile.')); }
    };
    reader.readAsDataURL(file);
  }

  function exportCandidates() {
    downloadCsv(
      'roster-candidates.csv',
      [t('Name'), t('Email'), t('Phone'), t('Current Title'), t('Current Employer'), t('Skills'), t('Source'), t('Owner')],
      candidates.map((c) => [c.name, c.email, c.phone, c.current_title, c.current_employer, c.skills, c.source, c.owner_name])
    );
  }
  function exportJobs() {
    downloadCsv(
      'roster-jobs.csv',
      [t('Title'), t('Client'), t('Type'), t('Pay Range'), t('Location'), t('Status'), t('Owner')],
      jobs.map((j) => [j.title, j.client_name, j.employment_type, j.pay_range, j.location, j.status, j.owner_name])
    );
  }
  function exportClients() {
    downloadCsv(
      'roster-clients.csv',
      [t('Company'), t('Industry'), t('Contact'), t('Email'), t('Phone'), t('Status'), t('Owner')],
      clients.map((c) => [c.company_name, c.industry, c.contact_name, c.contact_email, c.contact_phone, c.status, c.owner_name])
    );
  }
  function exportPlacements() {
    downloadCsv(
      'roster-placements.csv',
      [t('Candidate'), t('Client'), t('Job'), t('Start'), t('End'), t('Fee'), t('Status')],
      placements.map((p) => [p.candidate_name, p.client_name, p.job_title, p.start_date, p.end_date || '', p.placement_fee, p.status])
    );
  }

  return (
    <Layout title={t('Settings')}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PlanCard />
        <MyAccountCard />
        {account?.role === 'owner' && <StaffCard />}
        <CareersLinkCard />
        <Card className="p-1">
          <CardHead
            title={t('Agency Profile')}
            action={
              editingProfile || !owner ? null : (
                <IconButton icon="pencil" title={t('Edit profile')} onClick={startEditProfile} />
              )
            }
          />
          <div className="px-5 pb-5 text-sm">
            {!editingProfile && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    title={owner ? t('Change logo') : undefined}
                    disabled={!owner}
                    onClick={() => fileRef.current && fileRef.current.click()}
                    className="relative flex-shrink-0 rounded-lg group"
                  >
                    {logo ? (
                      <img src={logo} alt={profile.name} width={44} height={44} className="rounded-lg object-cover w-11 h-11" />
                    ) : (
                      <span className="w-11 h-11 rounded-lg bg-brandTint text-brand flex items-center justify-center font-display font-bold">
                        {(profile.name || 'R').slice(0, 1)}
                      </span>
                    )}
                    <span className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Icon name="camera" size={14} stroke="#fff" />
                      </span>
                    </span>
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
                  <p className="font-semibold text-ink">{profile.name || t('Your agency')}</p>
                </div>
                <p className="text-muted flex items-center gap-2"><Icon name="building" size={14} /> {profile.address}</p>
                <p className="text-muted flex items-center gap-2"><Icon name="phoneCall" size={14} /> {profile.phone}</p>
                <p className="text-muted flex items-center gap-2"><Icon name="mail" size={14} /> {profile.email}</p>
                <p className="text-muted flex items-center gap-2"><Icon name="target" size={14} /> {profile.description}</p>
                {!profile.address && !profile.phone && !profile.email && !profile.description && (
                  <p className="text-muted" data-testid="profile-empty">{owner ? t('Add your agency details with the pencil above.') : t('The owner has not added the agency details yet.')}</p>
                )}
                {profileError && <p className="text-sm text-rose" role="alert">{profileError}</p>}
                {profileSaved && (
                  <p className="text-sm text-green bg-greenTint border border-green/30 rounded-md px-3 py-2 flex items-center gap-1.5">
                    <Icon name="check" size={14} /> {t('Profile saved')}</p>
                )}
              </div>
            )}
            {editingProfile && (
              <div>
                <Field label={t('Company name')}>
                  <TextInput value={draftProfile.name} onChange={(e) => setDraftProfile((v) => ({ ...v, name: e.target.value }))} />
                </Field>
                <Field label={t('Address')}>
                  <TextInput value={draftProfile.address} onChange={(e) => setDraftProfile((v) => ({ ...v, address: e.target.value }))} />
                </Field>
                <Field label={t('Phone')}>
                  <TextInput value={draftProfile.phone} onChange={(e) => setDraftProfile((v) => ({ ...v, phone: e.target.value }))} />
                </Field>
                <Field label={t('Email')}>
                  <TextInput value={draftProfile.email} onChange={(e) => setDraftProfile((v) => ({ ...v, email: e.target.value }))} />
                </Field>
                <Field label={t('Description')}>
                  <TextArea value={draftProfile.description} onChange={(e) => setDraftProfile((v) => ({ ...v, description: e.target.value }))} />
                </Field>
                <Field label={t('Online payment link')} hint={t('Optional. Your own payment page (Stripe Payment Link, Square, PayPal…). It becomes the “Pay online” button on invoices.')}>
                  <TextInput value={draftProfile.payment_url || ''} placeholder="https://" onChange={(e) => setDraftProfile((v) => ({ ...v, payment_url: e.target.value }))} data-testid="profile-payment-url" />
                </Field>
                <Field label={t('Payment instructions')} hint={t('Shown on invoices, for example “Net 15. ACH details on request.”')}>
                  <TextArea value={draftProfile.payment_note || ''} onChange={(e) => setDraftProfile((v) => ({ ...v, payment_note: e.target.value }))} />
                </Field>
                {profileError && <p className="text-sm text-rose mb-2" role="alert">{profileError}</p>}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={cancelEditProfile}>{t('Cancel')}</Button>
                  <Button size="sm" onClick={submitProfile}>{t('Save')}</Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-1">
          <CardHead title={t('Team')} sub={users ? t('{n} recruiters & staff', { n: users.length }) : ''} />
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
          <CardHead
            title={t('WhatsApp Business')}
            sub={t('One shared number for the whole team')}
            action={
              waStatus && waStatus.connected ? (
                <Button variant="outline" size="sm" onClick={disconnectWhatsApp} disabled={waBusy}>
                  {waBusy ? t('Disconnecting…') : t('Disconnect')}
                </Button>
              ) : (
                <Button size="sm" data-testid="whatsapp-connect" data-plan-locked={waGate.locked ? waGate.minPlan : undefined} className="min-h-[40px]" onClick={() => (waGate.locked ? waGate.open() : setWaModalOpen(true))}>{t('Connect')}{waGate.locked && <PlanBadge gate="whatsapp" inherit />}</Button>
              )
            }
          />
          <div className="px-5 pb-5 text-sm">
            {waGate.locked && <p className="text-muted" data-plan-notice="whatsapp">{gateText('whatsapp', lang).what}</p>}
            {!waGate.locked && !waStatus && <p className="text-muted">{t('Checking connection…')}</p>}
            {!waGate.locked && waStatus && waStatus.connected && (
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-greenTint text-green flex items-center justify-center flex-shrink-0">
                  <Icon name="phoneCall" size={15} />
                </span>
                <div>
                  <p className="font-semibold text-ink">{t('Connected')}</p>
                  <p className="text-xs text-muted">{waStatus.displayPhone || t('WhatsApp Business number')}</p>
                </div>
              </div>
            )}
            {!waGate.locked && waStatus && !waStatus.connected && (
              <p className="text-muted">{t('Not connected — paste your Meta WhatsApp Business credentials to start sending and receiving messages from the WhatsApp page.')}</p>
            )}
          </div>
        </Card>

        <OfficesCard />
        <ConnectionsCard />
        <DeveloperCard />
        <RexConnectorCard />

        <Card className="p-1" data-testid="sms-card">
          <CardHead
            title={t('SMS (Twilio)')}
            sub={t('Text candidates from your own Twilio number')}
            action={
              !owner ? null : smsStatus && smsStatus.connected ? (
                <Button variant="outline" size="sm" onClick={disconnectSms} disabled={smsBusy}>{smsBusy ? t('Disconnecting…') : t('Disconnect')}</Button>
              ) : (
                <Button size="sm" onClick={() => (smsGate.locked ? smsGate.open() : setSmsModal(true))} data-testid="sms-connect-open" data-plan-locked={smsGate.locked ? smsGate.minPlan : undefined} className="min-h-[40px]">{t('Connect')}{smsGate.locked && <PlanBadge gate="messaging" inherit />}</Button>
              )
            }
          />
          <div className="px-5 pb-5 text-sm">
            {smsGate.locked && <p className="text-muted" data-plan-notice="messaging">{gateText('messaging', lang).what}</p>}
            {!smsGate.locked && !smsStatus && <p className="text-muted">{t('Checking connection…')}</p>}
            {!smsGate.locked && smsStatus && smsStatus.connected && (
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-greenTint text-green flex items-center justify-center flex-shrink-0"><Icon name="phoneCall" size={15} /></span>
                <div>
                  <p className="font-semibold text-ink">{t('Connected')}</p>
                  <p className="text-xs text-muted">{smsStatus.from_number}</p>
                </div>
              </div>
            )}
            {!smsGate.locked && smsStatus && !smsStatus.connected && (
              <p className="text-muted">{t('Not connected. Paste your Twilio Account SID, Auth Token and phone number to send texts from the Candidates page.')}</p>
            )}
          </div>
        </Card>

        <Card className="p-1">
          <CardHead title={t('Data Export')} sub={t('Download CSVs of your core records')} />
          <div className="divide-y divide-lineSoft">
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ink">{t('Candidates')} ({candidates.length})</span>
              <Button variant="outline" size="sm" onClick={exportCandidates}><Icon name="download" size={13} /> {t('Export')}</Button>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ink">{t('Jobs')} ({jobs.length})</span>
              <Button variant="outline" size="sm" onClick={exportJobs}><Icon name="download" size={13} /> {t('Export')}</Button>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ink">{t('Clients')} ({clients.length})</span>
              <Button variant="outline" size="sm" onClick={exportClients}><Icon name="download" size={13} /> {t('Export')}</Button>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ink">{t('Placements')} ({placements.length})</span>
              <Button variant="outline" size="sm" onClick={exportPlacements}><Icon name="download" size={13} /> {t('Export')}</Button>
            </div>
          </div>
        </Card>
      </div>

      {smsModal && <SmsConnectForm webhookUrl={smsStatus?.webhook_url} onClose={() => setSmsModal(false)} onConnected={() => { setSmsModal(false); refreshSms(); }} />}
      {waModalOpen && <WhatsAppConnectForm onClose={() => setWaModalOpen(false)} onConnected={onWhatsAppConnected} />}
    </Layout>
  );
}
