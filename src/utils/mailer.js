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

/**
 * Notifies a participant that exam results are available on the site.
 * Does not include scores — they must log in to view results.
 */
export async function sendAssessmentResultsReleasedEmail({
  to,
  studentName,
  assessmentTitle,
  title,
  resultUrl,
}) {
  const transport = getTransporter();

  if (!transport) {
    console.warn(
      '[mailer] SMTP is not configured. Results released but email was not sent. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.'
    );
    return { sent: false, skipped: true };
  }

  const safeName = studentName || 'there';
  const safeTitle = title || assessmentTitle || 'Assessment';
  const text = [
    `Hello ${safeName},`,
    '',
    `Results for "${safeTitle}" have been released.`,
    '',
    'Please log in to view your result on the website.',
    'Scores are not shared by email.',
    '',
    resultUrl ? `Open your result: ${resultUrl}` : '',
    '',
    `— ${env.siteName}`,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
      <p style="margin: 0 0 12px;">Hello ${escapeHtml(safeName)},</p>
      <p style="margin: 0 0 12px;">
        Results for <strong>${escapeHtml(safeTitle)}</strong> have been released.
      </p>
      <p style="margin: 0 0 16px; color: #555;">
        Please log in to view your result on the website.
        Scores are not shared by email.
      </p>
      ${
        resultUrl
          ? `<p style="margin: 0 0 16px;">
              <a href="${escapeHtml(resultUrl)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
                View result on site
              </a>
            </p>`
          : ''
      }
      <p style="margin: 0; color: #777; font-size: 13px;">— ${escapeHtml(env.siteName)}</p>
    </div>
  `;

  await transport.sendMail({
    from: `"${env.siteName}" <${env.smtp.from}>`,
    to,
    subject: `Results released: ${safeTitle}`,
    text,
    html,
  });

  return { sent: true };
}

/**
 * Sends a password-reset OTP to a student.
 */
export async function sendPasswordResetOtpEmail({ to, name, studentName, otp }) {
  const transport = getTransporter();

  if (!transport) {
    console.warn(
      '[mailer] SMTP is not configured. Password reset OTP was not sent. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.'
    );
    return { sent: false, skipped: true };
  }

  const safeName = name || studentName || 'User';
  const text = [
    `Hello ${safeName},`,
    '',
    `Your password reset code for ${env.siteName} is: ${otp}`,
    '',
    'This code expires in 10 minutes.',
    'If you did not request a password reset, you can ignore this email.',
    '',
    `— ${env.siteName}`,
  ].join('\n');

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
      <p style="margin: 0 0 12px;">Hello ${escapeHtml(safeName)},</p>
      <p style="margin: 0 0 12px;">Use this code to reset your password:</p>
      <p style="margin: 0 0 16px; font-size: 28px; letter-spacing: 6px; font-weight: 700; color: #0f766e;">
        ${escapeHtml(otp)}
      </p>
      <p style="margin: 0 0 12px; color: #555;">This code expires in 10 minutes.</p>
      <p style="margin: 0 0 16px; color: #777; font-size: 13px;">
        If you did not request a password reset, you can ignore this email.
      </p>
      <p style="margin: 0; color: #777; font-size: 13px;">— ${escapeHtml(env.siteName)}</p>
    </div>
  `;

  await transport.sendMail({
    from: `"${env.siteName}" <${env.smtp.from}>`,
    to,
    subject: `Password reset code — ${env.siteName}`,
    text,
    html,
  });

  return { sent: true };
}

/**
 * Notifies a user that their account was activated and they can log in.
 * For students, optionally includes registrationId and email for login.
 */
export async function sendAccountActivatedEmail({
  to,
  name,
  loginUrl,
  roleLabel = 'account',
  registrationId,
  email,
}) {
  const transport = getTransporter();

  if (!transport) {
    console.warn(
      '[mailer] SMTP is not configured. Account activated but email was not sent. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.'
    );
    return { sent: false, skipped: true };
  }

  const safeName = name || 'there';
  const loginEmail = email || to;
  const credentialsLines = [];
  if (registrationId || loginEmail) {
    credentialsLines.push('Your login details:');
    if (loginEmail) credentialsLines.push(`Email: ${loginEmail}`);
    if (registrationId) credentialsLines.push(`Registration ID: ${registrationId}`);
    credentialsLines.push('You can log in with either your email or Registration ID.');
    credentialsLines.push('');
  }

  const text = [
    `Hello ${safeName},`,
    '',
    `Good news — your ${roleLabel} at ${env.siteName} has been activated.`,
    '',
    ...credentialsLines,
    'You can now log in and start using the portal.',
    loginUrl ? `Login here: ${loginUrl}` : '',
    '',
    `— ${env.siteName}`,
  ]
    .filter(Boolean)
    .join('\n');

  const credentialsHtml =
    registrationId || loginEmail
      ? `<div style="margin: 0 0 16px; padding: 12px; background: #f6f6f6; border-radius: 8px;">
          <p style="margin: 0 0 8px; font-weight: 600;">Your login details</p>
          ${
            loginEmail
              ? `<p style="margin: 0 0 4px;"><strong>Email:</strong> ${escapeHtml(loginEmail)}</p>`
              : ''
          }
          ${
            registrationId
              ? `<p style="margin: 0 0 8px;"><strong>Registration ID:</strong> ${escapeHtml(registrationId)}</p>`
              : ''
          }
          <p style="margin: 0; color: #555; font-size: 13px;">
            You can log in with either your email or Registration ID.
          </p>
        </div>`
      : '';

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
      <p style="margin: 0 0 12px;">Hello ${escapeHtml(safeName)},</p>
      <p style="margin: 0 0 12px;">
        Good news — your <strong>${escapeHtml(roleLabel)}</strong> at
        <strong>${escapeHtml(env.siteName)}</strong> has been activated.
      </p>
      ${credentialsHtml}
      <p style="margin: 0 0 16px; color: #555;">
        Please log in to continue.
      </p>
      ${
        loginUrl
          ? `<p style="margin: 0 0 16px;">
              <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
                Log in now
              </a>
            </p>`
          : ''
      }
      <p style="margin: 0; color: #777; font-size: 13px;">— ${escapeHtml(env.siteName)}</p>
    </div>
  `;

  await transport.sendMail({
    from: `"${env.siteName}" <${env.smtp.from}>`,
    to,
    subject: `Your account is activated — ${env.siteName}`,
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
