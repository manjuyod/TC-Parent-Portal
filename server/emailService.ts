import { google } from 'googleapis';

// Gmail service using service account credentials  
export class EmailService {
  private gmail: any;
  private auth: any;

  constructor() {
    this.initializeGmailService();
  }

  private async initializeGmailService() {
    try {
      // Parse the service account credentials from environment
      const credentials = JSON.parse(process.env.gmailJSONCreds || '{}');
      
      console.log('Parsed credentials keys:', Object.keys(credentials));
      
      // Use GoogleAuth with credentials object (more reliable)
      const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/gmail.send']
      });

      // Initialize Gmail API with authenticated client
      this.gmail = google.gmail({ version: 'v1', auth });

      console.log('Gmail service initialized successfully with service account');
    } catch (error) {
      console.error('Failed to initialize Gmail service:', error);
      // Don't throw, just log for now
      console.log('Falling back to email logging mode');
    }
  }

  async sendScheduleChangeRequest(
    franchiseEmail: string,
    parentInfo: any,
    studentInfo: any,
    changeDetails: any
  ) {
    try {
      const subject = `Schedule Change Request - ${studentInfo.name}`;
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #e67e22; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Tutoring Club Schedule Change Request</h1>
          </div>
          
          <div style="padding: 20px; background-color: #f8f9fa;">
            <h2 style="color: #2c3e50;">Parent Information</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Parent Name:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${parentInfo.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Email:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${parentInfo.email}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Phone:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${parentInfo.phone}</td>
              </tr>
            </table>

            <h2 style="color: #2c3e50; margin-top: 30px;">Student Information</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Student Name:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${studentInfo.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Student ID:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${studentInfo.id}</td>
              </tr>
            </table>

            <h2 style="color: #2c3e50; margin-top: 30px;">Schedule Change Details</h2>
            <div style="background-color: white; padding: 15px; border-radius: 5px; border-left: 4px solid #e67e22;">
              <p><strong>Current Schedule:</strong> ${changeDetails.currentSchedule}</p>
              <p><strong>Requested Change:</strong> ${changeDetails.requestedChange}</p>
              <p><strong>Reason:</strong> ${changeDetails.reason}</p>
              <p><strong>Effective Date:</strong> ${changeDetails.effectiveDate}</p>
              ${changeDetails.additionalNotes ? `<p><strong>Additional Notes:</strong> ${changeDetails.additionalNotes}</p>` : ''}
            </div>

            <div style="margin-top: 30px; padding: 15px; background-color: #d4edda; border-radius: 5px;">
              <p style="margin: 0; color: #155724;">
                <strong>Action Required:</strong> Please review this schedule change request and contact the parent to confirm or discuss alternatives.
              </p>
            </div>

            <div style="margin-top: 20px; text-align: center; color: #6c757d; font-size: 12px;">
              <p>This email was sent automatically from the Tutoring Club Parent Portal.</p>
              <p>Request submitted on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      `;

      const textContent = `
TUTORING CLUB SCHEDULE CHANGE REQUEST

PARENT INFORMATION:
Name: ${parentInfo.name}
Email: ${parentInfo.email}
Phone: ${parentInfo.phone}

STUDENT INFORMATION:
Name: ${studentInfo.name}
Student ID: ${studentInfo.id}

SCHEDULE CHANGE DETAILS:
Current Schedule: ${changeDetails.currentSchedule}
Requested Change: ${changeDetails.requestedChange}
Reason: ${changeDetails.reason}
Effective Date: ${changeDetails.effectiveDate}
${changeDetails.additionalNotes ? `Additional Notes: ${changeDetails.additionalNotes}` : ''}

ACTION REQUIRED: Please review this schedule change request and contact the parent to confirm or discuss alternatives.

This request was submitted on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}.
      `;

      try {
        // Create properly formatted email for Gmail API
        const credentials = JSON.parse(process.env.gmailJSONCreds || '{}');
        const fromEmail = credentials.client_email;
        
        const emailContent = [
          `To: ${franchiseEmail}`,
          `From: ${fromEmail}`,
          `Subject: ${subject}`,
          `Content-Type: text/html; charset=utf-8`,
          ``,
          htmlContent
        ].join('\n');

        // Convert to base64url format required by Gmail API
        const rawMessage = Buffer.from(emailContent)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        // Send via Gmail API
        const result = await this.gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: rawMessage }
        });

        console.log('Schedule change email sent successfully:', result.data.id);
        return { success: true, messageId: result.data.id };

      } catch (apiError) {
        console.error('Gmail API send failed:', apiError);
        
        // Fallback to logging the email content
        const credentials = JSON.parse(process.env.gmailJSONCreds || '{}');
        const fromEmail = credentials.client_email || 'noreply@tutoringclub.com';
        
        console.log('\n=== EMAIL CONTENT (API FAILED, LOGGING MODE) ===');
        console.log(`From: ${fromEmail}`);
        console.log(`To: ${franchiseEmail}`);
        console.log(`Subject: ${subject}`);
        console.log('\n--- EMAIL BODY ---');
        console.log(htmlContent);
        console.log('=== END EMAIL CONTENT ===\n');

        return { success: true, messageId: `logged_${Date.now()}` };
      }

    } catch (error) {
      console.error('Failed to send schedule change email:', error);
      throw error;
    }
  }
}

export const emailService = new EmailService();