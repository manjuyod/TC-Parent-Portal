import { z } from "zod";

export const EmailEnv = z.object({
  MAIL_PROVIDER: z.enum(["resend","sendgrid","smtp"]).optional(),
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().email().optional(), // required for sendgrid/smtp
});

export type EmailEnv = z.infer<typeof EmailEnv>;

export function getEmailEnv(): EmailEnv {
  const parsed = EmailEnv.safeParse(process.env);
  if (!parsed.success) {
    // don't throw here; provider chooser will decide if we have enough
    console.warn("Email env not fully configured:", parsed.error.flatten());
  }
  return parsed.data || {};
}