import nodemailer from "nodemailer";

export async function sendWithSmtpGmail({ user, pass, from, to, subject, html, text }:{
  user: string, pass: string, from: string, to: string | string[], subject: string, html: string, text?: string
}) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass }, // App Password recommended
  });
  const info = await transporter.sendMail({
    from, to, subject, html, text
  });
  return info.messageId || "ok";
}