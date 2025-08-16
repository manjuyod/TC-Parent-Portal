import type { Express } from "express";
import { z } from "zod";
import { sendEmail, renderScheduleChangeEmail } from "../email";

export function registerEmailTestRoute(app: Express) {
  // Health check route for email service
  app.get("/v1/email/health", async (req, res) => {
    const env = require("../util/env").getEmailEnv();
    const providers = [];
    
    if (env.RESEND_API_KEY) providers.push("resend");
    if (env.SENDGRID_API_KEY) providers.push("sendgrid");
    if (env.SMTP_USER && env.SMTP_PASS) providers.push("smtp");
    
    res.json({
      status: providers.length > 0 ? "configured" : "unconfigured",
      providers: providers,
      hasMailFrom: !!env.MAIL_FROM,
      selectedProvider: env.MAIL_PROVIDER || "auto"
    });
  });

  app.post("/v1/email/test", async (req, res) => {
    try {
      const Body = z.object({
        to: z.string().email(),
        studentName: z.string().min(1),
        parentName: z.string().min(1),
        message: z.string().min(1)
      });
      
      const body = Body.parse(req.body);
      
      const { html, text } = renderScheduleChangeEmail({ 
        parentName: body.parentName,
        parentEmail: body.to,
        parentPhone: "(555) 123-4567",
        studentName: body.studentName, 
        studentId: "12345",
        currentSchedule: "Monday 3:00 PM",
        requestedChange: body.message,
        reason: "Test email from API",
        effectiveDate: new Date().toISOString().split('T')[0],
        additionalNotes: "This is a test email"
      });
      
      const id = await sendEmail({
        to: body.to,
        subject: `Test Schedule Change Request - ${body.studentName}`,
        html,
        text
      });
      
      return res.status(202).json({ ok: true, id });
    } catch (error) {
      console.error("Email test error:", error);
      return res.status(400).json({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
}