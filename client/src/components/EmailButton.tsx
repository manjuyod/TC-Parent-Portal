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
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Priority: Gmail app -> Gmail web -> Default email client
    if (isMobile) {
      // On mobile, try Gmail app first with proper URL scheme
      const gmailAppLink = `googlegmail://co?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      
      // Use a more reliable method to detect if app opens
      let appOpened = false;
      const startTime = Date.now();
      
      const tryGmailApp = () => {
        window.location.href = gmailAppLink;
        
        // Check if user is still on page after short delay (indicates app didn't open)
        setTimeout(() => {
          if (!appOpened && (Date.now() - startTime) < 2000) {
            // Gmail app didn't open, try Gmail web
            const gmailWebLink = buildGmailCompose({ to, subject, body });
            window.open(gmailWebLink, '_blank');
          }
        }, 500);
      };
      
      // Detect when user leaves/returns to detect app opening
      const handleVisibilityChange = () => {
        if (document.hidden) {
          appOpened = true;
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      tryGmailApp();
      
      // Clean up event listener
      setTimeout(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }, 3000);
      
    } else {
      // On desktop, prefer Gmail web interface
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