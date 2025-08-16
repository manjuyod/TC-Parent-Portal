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
 * Create a temporary link element to trigger email opening
 */
function createTempLink(href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.style.display = 'none';
  document.body.appendChild(link);
  return link;
}

/**
 * Try to open an app via deep link with fallback detection
 */
function tryAppLink(appUrl: string, fallbackFn: () => void, timeout: number = 800): void {
  console.log('Trying app link:', appUrl);
  
  let appOpened = false;
  
  // Create hidden iframe to try app link
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = appUrl;
  document.body.appendChild(iframe);
  
  // Detect if app opened by checking if window lost focus
  const checkFocus = () => {
    if (document.hidden || !document.hasFocus()) {
      appOpened = true;
      console.log('App appears to have opened');
    }
  };
  
  // Listen for page visibility changes
  document.addEventListener('visibilitychange', checkFocus);
  window.addEventListener('blur', checkFocus);
  
  // Cleanup and fallback after timeout
  setTimeout(() => {
    document.removeEventListener('visibilitychange', checkFocus);
    window.removeEventListener('blur', checkFocus);
    document.body.removeChild(iframe);
    
    if (!appOpened) {
      console.log('App did not open, using fallback');
      fallbackFn();
    }
    navigationInProgress = false;
  }, timeout);
}

/**
 * Open email with preference for Gmail app on mobile, then Gmail web, then mailto
 */
export function openWithPreference(links: EmailLinks): void {
  if (navigationInProgress) {
    console.log('Navigation already in progress, skipping');
    return;
  }
  
  navigationInProgress = true;
  console.log('Opening email with links:', links);
  
  try {
    const mobile = isMobile();
    console.log('Is mobile:', mobile);
    
    // Mobile: try Gmail app first
    if (mobile && links.gmailApp) {
      console.log('Trying Gmail app on mobile');
      tryAppLink(links.gmailApp, () => {
        // Fallback to Gmail web or mailto
        if (links.gmailWeb) {
          console.log('Falling back to Gmail web');
          try {
            window.open(links.gmailWeb, '_blank');
          } catch (error) {
            console.warn('Gmail web failed, using mailto:', error);
            window.location.href = links.mailto;
          }
        } else {
          console.log('No Gmail web, using mailto');
          window.location.href = links.mailto;
        }
      });
      return;
    }
    
    // Desktop or no Gmail app: try Gmail web
    if (links.gmailWeb) {
      console.log('Trying Gmail web');
      try {
        const newWindow = window.open(links.gmailWeb, '_blank');
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          // Popup blocked, fallback to mailto
          console.warn('Popup blocked, using mailto');
          window.location.href = links.mailto;
        } else {
          console.log('Gmail web opened successfully');
        }
        navigationInProgress = false;
        return;
      } catch (error) {
        console.warn('Gmail web failed, falling back to mailto:', error);
      }
    }
    
    // Final fallback: mailto
    console.log('Using mailto fallback');
    const mailtoLink = createTempLink(links.mailto);
    mailtoLink.click();
    document.body.removeChild(mailtoLink);
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
  console.log('Opening email with preference:', prefer, emailParams);
  
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
  
  console.log('Generated email links:', links);
  
  switch (prefer) {
    case 'auto':
      openWithPreference(links);
      break;
      
    case 'gmail':
      console.log('Using Gmail preference');
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
        const mailtoLink = createTempLink(links.mailto);
        mailtoLink.click();
        document.body.removeChild(mailtoLink);
      }
      break;
      
    case 'outlook':
      console.log('Using Outlook preference');
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
        const mailtoLink = createTempLink(links.mailto);
        mailtoLink.click();
        document.body.removeChild(mailtoLink);
      }
      break;
      
    case 'mailto':
    default:
      console.log('Using mailto');
      const mailtoLink = createTempLink(links.mailto);
      mailtoLink.click();
      document.body.removeChild(mailtoLink);
      break;
  }
}