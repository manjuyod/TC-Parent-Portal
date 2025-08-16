export function scheduleChangeEmail({ 
  parentName, 
  parentEmail, 
  parentPhone, 
  studentName, 
  studentId, 
  currentSchedule, 
  requestedChange, 
  reason, 
  effectiveDate, 
  additionalNotes 
}: {
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
  const content = `
    <div style="background-color: #e67e22; color: white; padding: 20px; text-align: center;">
      <h1 style="margin: 0;">Tutoring Club Schedule Change Request</h1>
    </div>
    
    <div style="padding: 20px; background-color: #f8f9fa;">
      <h2 style="color: #2c3e50;">Parent Information</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Parent Name:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(parentName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Email:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(parentEmail)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Phone:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(parentPhone)}</td>
        </tr>
      </table>

      <h2 style="color: #2c3e50; margin-top: 30px;">Student Information</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Student Name:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(studentName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Student ID:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(String(studentId))}</td>
        </tr>
      </table>

      <h2 style="color: #2c3e50; margin-top: 30px;">Schedule Change Details</h2>
      <div style="background-color: white; padding: 15px; border-radius: 5px; border-left: 4px solid #e67e22;">
        <p><strong>Current Schedule:</strong> ${escapeHtml(currentSchedule)}</p>
        <p><strong>Requested Change:</strong> ${escapeHtml(requestedChange)}</p>
        <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
        <p><strong>Effective Date:</strong> ${escapeHtml(effectiveDate)}</p>
        ${additionalNotes ? `<p><strong>Additional Notes:</strong> ${escapeHtml(additionalNotes)}</p>` : ''}
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
  return content;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, m => ({ 
    "&": "&amp;", 
    "<": "&lt;", 
    ">": "&gt;", 
    "\"": "&quot;", 
    "'": "&#39;" 
  }[m]!));
}