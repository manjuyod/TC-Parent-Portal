import { sendEmail, renderScheduleChangeEmail } from "./src/email/index.js";

// New email service using multi-provider approach
export class EmailService {
  constructor() {
    console.log('New email service initialized with multi-provider support');
  }

  async sendScheduleChangeRequest(
    franchiseEmail: string,
    parentInfo: any,
    studentInfo: any,
    changeDetails: any
  ) {
    try {
      const subject = `Schedule Change Request - ${studentInfo.name}`;
      
      const { html, text } = renderScheduleChangeEmail({
        parentName: parentInfo.name,
        parentEmail: parentInfo.email,
        parentPhone: parentInfo.phone,
        studentName: studentInfo.name,
        studentId: studentInfo.id,
        currentSchedule: changeDetails.currentSchedule,
        requestedChange: changeDetails.requestedChange,
        reason: changeDetails.reason,
        effectiveDate: changeDetails.effectiveDate,
        additionalNotes: changeDetails.additionalNotes
      });

      const messageId = await sendEmail({
        to: franchiseEmail,
        subject: subject,
        html: html,
        text: text
      });

      console.log('Schedule change email sent successfully:', messageId);
      return { success: true, messageId: messageId };

    } catch (error) {
      console.error('Failed to send schedule change email:', error);
      throw error;
    }
  }
}

export const emailService = new EmailService();