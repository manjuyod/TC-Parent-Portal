import { google } from 'googleapis';

// Gmail service setup using service account credentials
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
      
      // Create OAuth2 client with service account
      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/gmail.send']
      });

      // Initialize Gmail API
      this.gmail = google.gmail({ version: 'v1', auth: this.auth });

      console.log('Gmail service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Gmail service:', error);
      throw error;
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

      // Create email in RFC 2822 format
      const credentials = JSON.parse(process.env.gmailJSONCreds || '{}');
      const fromEmail = credentials.client_email || 'noreply@tutoringclub.com';
      
      const emailLines = [
        `From: Tutoring Club Portal <${fromEmail}>`,
        `To: ${franchiseEmail}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="boundary123"`,
        ``,
        `--boundary123`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        textContent,
        ``,
        `--boundary123`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        htmlContent,
        ``,
        `--boundary123--`
      ];

      const emailContent = emailLines.join('\r\n');
      const encodedEmail = Buffer.from(emailContent).toString('base64url');

      // Send email using Gmail API
      const result = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      });

      console.log('Schedule change email sent successfully:', result.data.id);
      return { success: true, messageId: result.data.id };

    } catch (error) {
      console.error('Failed to send schedule change email:', error);
      throw error;
    }
  }
}

export const emailService = new EmailService();