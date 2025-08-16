import sg from "@sendgrid/mail";

export async function sendWithSendgrid({ apiKey, from, to, subject, html, text }:{
  apiKey: string, from: string, to: string | string[], subject: string, html: string, text?: string
}) {
  sg.setApiKey(apiKey);
  const [res] = await sg.send({
    from, to, subject, html, text,
  });
  if (res.statusCode >= 400) throw new Error(`SendGrid ${res.statusCode}`);
  return res.headers["x-message-id"] || "ok";
}