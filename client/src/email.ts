interface EmailParams {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}

export function buildMailto({ to, cc, bcc, subject, body }: EmailParams): string {
  const params = new URLSearchParams();
  
  if (cc) params.append('cc', cc);
  if (bcc) params.append('bcc', bcc);
  params.append('subject', subject);
  params.append('body', body);
  
  return `mailto:${to}?${params.toString()}`;
}

export function buildGmailCompose({ to, cc, bcc, subject, body }: EmailParams): string {
  const params = new URLSearchParams();
  
  params.append('to', to);
  if (cc) params.append('cc', cc);
  if (bcc) params.append('bcc', bcc);
  params.append('su', subject);
  params.append('body', body);
  
  return `https://mail.google.com/mail/?view=cm&fs=1&${params.toString()}`;
}

export function buildOutlookCompose({ to, subject, body }: { to: string; subject: string; body: string }): string {
  const params = new URLSearchParams();
  
  params.append('to', to);
  params.append('subject', subject);
  params.append('body', body);
  
  return `https://outlook.live.com/mail/0/deeplink/compose?${params.toString()}`;
}