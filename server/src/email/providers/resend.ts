import { Resend } from "resend";

export async function sendWithResend({ apiKey, from, to, subject, html, text }:{
  apiKey: string, from: string, to: string | string[], subject: string, html: string, text?: string
}) {
  const r = new Resend(apiKey);
  const res = await r.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  });
  if (res.error) throw new Error(`Resend error: ${res.error.message}`);
  return res.data?.id || "ok";
}