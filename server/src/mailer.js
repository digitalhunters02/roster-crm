// Sends the "forgot password" reset link. Configure SMTP_* env vars to send
// for real (anything that speaks SMTP). Without them the link is only logged
// server-side and the login screen tells the user email is not set up yet.
import nodemailer from 'nodemailer';

const APP_NAME = process.env.APP_NAME || 'Roster';

let transporter = null;
if (process.env.SMTP_HOST) {
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
