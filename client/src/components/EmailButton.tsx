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
  prefer = "gmail" 
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
    
    // Desktop priority: Gmail web -> Gmail app -> Default email client
    const isDesktop = !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    
    if (isDesktop) {
      // Try Gmail web first (most reliable on desktop)
      const gmailLink = buildGmailCompose({ to, subject, body });
      window.open(gmailLink, '_blank');
    } else {
      // On mobile, try Gmail app first, then fallback to mailto
      try {
        const gmailLink = buildGmailCompose({ to, subject, body });
        window.open(gmailLink, '_blank');
      } catch (error) {
        // Fallback to default email client on mobile
        const mailtoLink = buildMailto({ to, subject, body });
        window.location.href = mailtoLink;
      }
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