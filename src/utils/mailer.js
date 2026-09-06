import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

function isSmtpConfigured() {
  return Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);
}

let transporter;

function getTransporter() {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    });
  }

  return transporter;
}

/**
 * Sends a contact-form notification to the academy inbox.
 * Returns { sent: boolean, skipped?: boolean }.
 * Does not throw on SMTP misconfiguration so the query can still be saved.
 */
export async function sendContactNotification({ name, email, phone, subject, message }) {
  const transport = getTransporter();

  if (!transport) {
    console.warn(
      '[mailer] SMTP is not configured. Contact query saved but email was not sent. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.'
    );
    return { sent: false, skipped: true };
  }

  const phoneLine = phone ? phone : 'Not provided';
  const text = [
    `New contact query from ${env.siteName}`,
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phoneLine}`,
    `Subject: ${subject}`,
    '',
    'Message:',
    message,
  ].join('\n');

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="margin: 0 0 12px;">New contact query</h2>
      <p style="margin: 0 0 16px; color: #555;">From ${env.siteName}</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
        <tr><td style="padding: 6px 0; font-weight: 600;">Name</td><td style="padding: 6px 0;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: 600;">Email</td><td style="padding: 6px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding: 6px 0; font-weight: 600;">Phone</td><td style="padding: 6px 0;">${escapeHtml(phoneLine)}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: 600;">Subject</td><td style="padding: 6px 0;">${escapeHtml(subject)}</td></tr>
      </table>
      <div style="margin-top: 16px; padding: 12px; background: #f6f6f6; border-radius: 8px; white-space: pre-wrap;">${escapeHtml(message)}</div>
    </div>
  `;

  await transport.sendMail({
    from: `"${env.siteName}" <${env.smtp.from}>`,
    to: env.contactToEmail,
    replyTo: email,
    subject: `[Contact] ${subject}`,
    text,
    html,
  });

  return { sent: true };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
