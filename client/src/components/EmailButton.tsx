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
    
    // Simplified approach that works better in preview environments
    // Try Gmail app first, then fallback to Gmail web
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      // On mobile: Try Gmail app, then Gmail web, then default
      const gmailAppLink = `googlegmail://co?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      
      // Create a hidden iframe to test app availability
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = gmailAppLink;
      document.body.appendChild(iframe);
      
      // Clean up iframe and fallback to Gmail web after short delay
      setTimeout(() => {
        document.body.removeChild(iframe);
        const gmailWebLink = buildGmailCompose({ to, subject, body });
        window.open(gmailWebLink, '_blank');
      }, 1000);
      
    } else {
      // On desktop: Gmail web interface works best
      const gmailWebLink = buildGmailCompose({ to, subject, body });
      window.open(gmailWebLink, '_blank');
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