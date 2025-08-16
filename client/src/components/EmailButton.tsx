import { buildMailto, buildGmailCompose, buildOutlookCompose } from '../email';

interface EmailButtonProps {
  to: string;
  studentName: string;
  details: {
    current: string;
    requested: string;
    reason: string;
    effectiveDate: string;
    notes?: string;
  };
  prefer?: "mailto" | "gmail" | "outlook";
}

export default function EmailButton({ 
  to, 
  studentName, 
  details, 
  prefer = "mailto" 
}: EmailButtonProps) {
  const handleEmailClick = () => {
    const subject = `Schedule Change – ${studentName}`;
    
    const bodyLines = [
      `Student: ${studentName}`,
      `Current Schedule: ${details.current}`,
      `Requested Change: ${details.requested}`,
      `Reason: ${details.reason}`,
      `Effective Date: ${details.effectiveDate}`
    ];
    
    if (details.notes) {
      bodyLines.push(`Additional Notes: ${details.notes}`);
    }
    
    const body = bodyLines.join('\r\n');
    
    let emailLink: string;
    
    switch (prefer) {
      case "gmail":
        emailLink = buildGmailCompose({ to, subject, body });
        window.open(emailLink, '_blank');
        break;
      case "outlook":
        emailLink = buildOutlookCompose({ to, subject, body });
        window.open(emailLink, '_blank');
        break;
      default:
        emailLink = buildMailto({ to, subject, body });
        window.location.href = emailLink;
        break;
    }
  };

  return (
    <button 
      type="button"
      className="btn btn-success"
      onClick={handleEmailClick}
    >
      Send Email
    </button>
  );
}