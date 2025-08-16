import pRetry from "p-retry";
import { getEmailEnv } from "../util/env";
import { wrapHtml, toText } from "./templates/base";
import { sendWithResend } from "./providers/resend";
import { sendWithSendgrid } from "./providers/sendgrid";
import { sendWithSmtpGmail } from "./providers/smtp_gmail";

type SendArgs = { to: string|string[]; subject: string; html: string; text?: string; from?: string; };

export async function sendEmail(args: SendArgs) {
  const env = getEmailEnv();
  const from = args.from || env.MAIL_FROM || "no-reply@tutoringclub.com"; // fallback

  const task = async () => {
    // explicit provider
    if (env.MAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
      return sendWithResend({ apiKey: env.RESEND_API_KEY, from, ...args });
    }
    if (env.MAIL_PROVIDER === "sendgrid" && env.SENDGRID_API_KEY) {
      return sendWithSendgrid({ apiKey: env.SENDGRID_API_KEY, from, ...args });
    }
    if (env.MAIL_PROVIDER === "smtp" && env.SMTP_USER && env.SMTP_PASS) {
      return sendWithSmtpGmail({ user: env.SMTP_USER, pass: env.SMTP_PASS, from, ...args });
    }
    // auto-pick based on available secrets
    if (env.RESEND_API_KEY)   return sendWithResend({ apiKey: env.RESEND_API_KEY, from, ...args });
    if (env.SENDGRID_API_KEY) return sendWithSendgrid({ apiKey: env.SENDGRID_API_KEY, from, ...args });
    if (env.SMTP_USER && env.SMTP_PASS)
      return sendWithSmtpGmail({ user: env.SMTP_USER, pass: env.SMTP_PASS, from, ...args });

    throw new Error("No email provider configured");
  };

  return pRetry(task, { retries: 2, factor: 2 }); // basic retry
}

// Inline schedule change email template to avoid import issues
function scheduleChangeEmailTemplate(input: {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  studentName: string;
  studentId: string | number;
  currentSchedule: string;
  requestedChange: string;
  reason: string;
  effectiveDate: string;
  additionalNotes?: string;
}) {
  const escapeHtml = (s: string): string => {
    return s.replace(/[&<>"']/g, m => ({ 
      "&": "&amp;", 
      "<": "&lt;", 
      ">": "&gt;", 
      "\"": "&quot;", 
      "'": "&#39;" 
    }[m]!));
  };

  return `
    <div style="background-color: #e67e22; color: white; padding: 20px; text-align: center;">
      <h1 style="margin: 0;">Tutoring Club Schedule Change Request</h1>
    </div>
    
    <div style="padding: 20px; background-color: #f8f9fa;">
      <h2 style="color: #2c3e50;">Parent Information</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Parent Name:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(input.parentName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Email:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(input.parentEmail)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Phone:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(input.parentPhone)}</td>
        </tr>
      </table>

      <h2 style="color: #2c3e50; margin-top: 30px;">Student Information</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Student Name:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(input.studentName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Student ID:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(String(input.studentId))}</td>
        </tr>
      </table>

      <h2 style="color: #2c3e50; margin-top: 30px;">Schedule Change Details</h2>
      <div style="background-color: white; padding: 15px; border-radius: 5px; border-left: 4px solid #e67e22;">
        <p><strong>Current Schedule:</strong> ${escapeHtml(input.currentSchedule)}</p>
        <p><strong>Requested Change:</strong> ${escapeHtml(input.requestedChange)}</p>
        <p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>
        <p><strong>Effective Date:</strong> ${escapeHtml(input.effectiveDate)}</p>
        ${input.additionalNotes ? `<p><strong>Additional Notes:</strong> ${escapeHtml(input.additionalNotes)}</p>` : ''}
      </div>

      <div style="margin-top: 30px; padding: 15px; background-color: #d4edda; border-radius: 5px;">
        <p style="margin: 0; color: #155724;">
          <strong>Action Required:</strong> Please review this schedule change request and contact the parent to confirm or discuss alternatives.
        </p>
      </div>

      <div style="margin-top: 20px; text-align: center; color: #6c757d; font-size: 12px;">
        <p>Request submitted on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
      </div>
    </div>
  `;
}

export function renderScheduleChangeEmail(input: {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  studentName: string;
  studentId: string | number;
  currentSchedule: string;
  requestedChange: string;
  reason: string;
  effectiveDate: string;
  additionalNotes?: string;
}) {
  const html = wrapHtml(scheduleChangeEmailTemplate(input));
  return { html, text: toText(html) };
}