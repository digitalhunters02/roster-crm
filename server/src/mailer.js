// Sends the "forgot password" reset link. Configure SMTP_* env vars to send
// for real (anything that speaks SMTP). Without them the link is only logged
// server-side and the login screen tells the user email is not set up yet.
import fs from 'node:fs';
import nodemailer from 'nodemailer';

const APP_NAME = process.env.APP_NAME || 'Roster';

let transporter = null;
if (process.env.MAIL_OUTBOX_FILE) {
  // Test hook: write each message as a JSON line instead of sending it.
  const json = nodemailer.createTransport({ jsonTransport: true });
  transporter = { sendMail: async (m) => { const r = await json.sendMail(m); fs.appendFileSync(process.env.MAIL_OUTBOX_FILE, r.message + '\n'); return r; } };
} else if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export function isMailConfigured() {
  return !!transporter;
}

export async function sendPasswordResetEmail(to, resetUrl) {
  if (!transporter) {
    console.log(`[auth] SMTP not configured. Password reset link for ${to}:\n  ${resetUrl}`);
    return false;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `${APP_NAME} <no-reply@impactdigital.network>`,
    to,
    subject: `Reset your password - ${APP_NAME}`,
    html: `
      <p>We received a request to reset the password for your ${APP_NAME} account.</p>
      <p><a href="${resetUrl}">Click here to set a new password</a></p>
      <p>This link expires in 1 hour and can be used once. If you didn't ask for this, you can safely ignore this email.</p>
    `,
  });
  return true;
}

// Generic notice (usage warnings). Plain text; falls back to the server log when SMTP is not set.
export async function sendNoticeEmail(to, subject, text) {
  if (!transporter) { console.log(`[notice] SMTP not configured. To ${to}: ${subject}`); return false; }
  await transporter.sendMail({ from: process.env.SMTP_FROM || `${APP_NAME} <no-reply@impactdigital.network>`, to, subject, text });
  return true;
}

// One-to-one e-mail from the agency to a candidate or client (no bulk sending in Roster). Reply goes to the agency,
// and the agency's name shows as the sender name while the address stays ours (SMTP_FROM).
export async function sendEmail({ to, subject, text, replyTo, fromName }) {
  if (!transporter) return false;
  const base = process.env.SMTP_FROM || `${APP_NAME} <no-reply@impactdigital.network>`;
  const addr = (base.match(/<([^>]+)>/) || [null, base])[1].trim();
  const name = String(fromName || '').replace(/["<>\r\n]/g, '').trim();
  await transporter.sendMail({ from: name ? `"${name}" <${addr}>` : base, to, subject, text, ...(replyTo ? { replyTo } : {}) });
  return true;
}
