// Email compose helpers for Gmail app, Gmail web, Outlook, and mailto

export interface EmailParams {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}

export interface EmailLinks {
  gmailApp?: string;
  gmailWeb?: string;
  mailto: string;
  outlook?: string;
}

/**
 * Build a mailto URL
 */
export function buildMailto({ to, cc, bcc, subject, body }: EmailParams): string {
  const params = new URLSearchParams();
  
  if (cc) params.append('cc', cc);
  if (bcc) params.append('bcc', bcc);
  if (subject) params.append('subject', subject);
  if (body) params.append('body', body);
  
  const queryString = params.toString();
  return `mailto:${encodeURIComponent(to)}${queryString ? '?' + queryString : ''}`;
}

/**
 * Build a Gmail web compose URL
 */
export function buildGmailWebCompose({ to, cc, bcc, subject, body }: EmailParams): string {
  const params = new URLSearchParams();
  params.append('view', 'cm');
  params.append('fs', '1');
  params.append('to', to);
  
  if (cc) params.append('cc', cc);
  if (bcc) params.append('bcc', bcc);
  if (subject) params.append('su', subject);
  if (body) params.append('body', body);
  
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/**
 * Build Gmail app deep link for mobile
 */
export function buildGmailAppCompose({ to, subject, body }: Pick<EmailParams, 'to' | 'subject' | 'body'>): string {
  const params = new URLSearchParams();
  params.append('to', to);
  if (subject) params.append('subject', subject);
  if (body) {
    // Use CRLF line breaks for mobile apps
    const formattedBody = body.replace(/\n/g, '\r\n');
    params.append('body', formattedBody);
  }
  
  // Detect iOS vs Android for appropriate scheme
  const userAgent = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  
  if (isIOS) {
    return `googlegmail://co?${params.toString()}`;
  } else {
    // Android fallback
    return `gmail://co?${params.toString()}`;
  }
}

/**
 * Build Outlook web compose URL
 */
export function buildOutlookWebCompose({ to, cc, bcc, subject, body }: EmailParams): string {
  const params = new URLSearchParams();
  params.append('to', to);
  
  if (cc) params.append('cc', cc);
  if (bcc) params.append('bcc', bcc);
  if (subject) params.append('subject', subject);
  if (body) params.append('body', body);
  
  return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
}

/**
 * Detect if user is on mobile device
 */
export function isMobile(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod|android/.test(userAgent);
}

/**
 * Truncate email content to stay under URI length limits (~2000 chars)
 */
export function truncateEmailContent(content: string, maxLength: number = 1500): string {
  if (content.length <= maxLength) {
    return content;
  }
  
  return content.substring(0, maxLength) + '\r\n\r\n(truncated)';
}

// Global flag to prevent double navigation
let navigationInProgress = false;

/**
 * Open email with preference for Gmail app on mobile, then Gmail web, then mailto
 */
export function openWithPreference(links: EmailLinks): void {
  if (navigationInProgress) {
    return;
  }
  
  navigationInProgress = true;
  
  try {
    const mobile = isMobile();
    
    // Mobile: try Gmail app first
    if (mobile && links.gmailApp) {
      // Try to open Gmail app
      window.location.href = links.gmailApp;
      
      // Set timeout to fallback to Gmail web if app doesn't open
      setTimeout(() => {
        if (navigationInProgress) {
          try {
            if (links.gmailWeb) {
              window.open(links.gmailWeb, '_blank');
            } else {
              window.location.href = links.mailto;
            }
          } catch (error) {
            console.warn('Fallback to mailto after Gmail app/web failed:', error);
            window.location.href = links.mailto;
          }
          navigationInProgress = false;
        }
      }, 700); // Conservative timeout
      
      return;
    }
    
    // Desktop or no Gmail app: try Gmail web
    if (links.gmailWeb) {
      try {
        const newWindow = window.open(links.gmailWeb, '_blank');
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          // Popup blocked, fallback to mailto
          throw new Error('Popup blocked');
        }
        navigationInProgress = false;
        return;
      } catch (error) {
        console.warn('Gmail web failed, falling back to mailto:', error);
      }
    }
    
    // Final fallback: mailto
    window.location.href = links.mailto;
    navigationInProgress = false;
    
  } catch (error) {
    console.error('Email opening failed:', error);
    window.location.href = links.mailto;
    navigationInProgress = false;
  }
}

/**
 * Open email with specific preference
 */
export function openEmailWithPreference(
  emailParams: EmailParams, 
  prefer: 'auto' | 'gmail' | 'mailto' | 'outlook' = 'auto'
): void {
  // Ensure content is within limits
  const truncatedParams = {
    ...emailParams,
    body: truncateEmailContent(emailParams.body),
    subject: emailParams.subject.length > 200 ? 
      emailParams.subject.substring(0, 200) + '...' : 
      emailParams.subject
  };
  
  const links: EmailLinks = {
    mailto: buildMailto(truncatedParams),
    gmailWeb: buildGmailWebCompose(truncatedParams),
    gmailApp: buildGmailAppCompose(truncatedParams),
    outlook: buildOutlookWebCompose(truncatedParams)
  };
  
  switch (prefer) {
    case 'auto':
      openWithPreference(links);
      break;
      
    case 'gmail':
      try {
        if (links.gmailWeb) {
          const newWindow = window.open(links.gmailWeb, '_blank');
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            throw new Error('Popup blocked');
          }
        } else {
          throw new Error('Gmail web not available');
        }
      } catch (error) {
        console.warn('Gmail failed, falling back to mailto:', error);
        window.location.href = links.mailto;
      }
      break;
      
    case 'outlook':
      try {
        if (links.outlook) {
          const newWindow = window.open(links.outlook, '_blank');
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            throw new Error('Popup blocked');
          }
        } else {
          throw new Error('Outlook web not available');
        }
      } catch (error) {
        console.warn('Outlook failed, falling back to mailto:', error);
        window.location.href = links.mailto;
      }
      break;
      
    case 'mailto':
    default:
      window.location.href = links.mailto;
      break;
  }
}