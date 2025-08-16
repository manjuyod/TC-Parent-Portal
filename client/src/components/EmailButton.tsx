import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { openEmailWithPreference } from '../email';

export interface ScheduleChangeDetails {
  current: string;
  requested: string;
  reason: string;
  effectiveDate: string;
  notes?: string;
}

export interface EmailButtonProps {
  inquiryId: string | number;
  studentName: string;
  details: ScheduleChangeDetails;
  prefer?: 'auto' | 'gmail' | 'mailto' | 'outlook';
  className?: string;
  disabled?: boolean;
}

export function EmailButton({ 
  inquiryId, 
  studentName, 
  details, 
  prefer = 'auto',
  className = '',
  disabled = false
}: EmailButtonProps) {
  const [centerEmail, setCenterEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const { toast } = useToast();

  // Fetch center email on mount or when inquiryId changes
  useEffect(() => {
    if (!inquiryId) return;
    
    fetchCenterEmail();
  }, [inquiryId]);

  const fetchCenterEmail = async () => {
    if (centerEmail) return; // Already loaded
    
    setIsEmailLoading(true);
    try {
      const response = await fetch(`/v1/inquiries/${inquiryId}/center-email`, {
        method: 'GET',
        credentials: 'include', // Include session cookies
      });

      if (response.ok) {
        const data = await response.json();
        setCenterEmail(data.email);
      } else if (response.status === 404) {
        toast({
          title: "Center Email Not Found",
          description: "Unable to find the email address for your tutoring center. Please contact them directly.",
          variant: "destructive",
        });
      } else if (response.status === 429) {
        toast({
          title: "Rate Limit Exceeded",
          description: "Please wait a moment before trying again.",
          variant: "destructive",
        });
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to fetch center email:', error);
      toast({
        title: "Error Loading Email",
        description: "Unable to load the center email address. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsEmailLoading(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const buildEmailBody = (): string => {
    const lines = [
      `Student: ${studentName}`,
      `Current: ${details.current}`,
      `Requested: ${details.requested}`,
      `Reason: ${details.reason}`,
      `Effective Date: ${details.effectiveDate}`,
    ];

    if (details.notes?.trim()) {
      lines.push(`Notes: ${details.notes.trim()}`);
    }

    lines.push('', '— Sent from Parent Portal');
    
    return lines.join('\r\n');
  };

  const handleEmailCompose = async (event: React.MouseEvent) => {
    // Prevent any default button behavior
    event.preventDefault();
    event.stopPropagation();
    
    console.log('EmailButton clicked, isLoading:', isLoading, 'disabled:', disabled);
    
    if (disabled || isLoading) {
      console.log('Button disabled or loading, returning early');
      return;
    }

    // Fetch email if not already loaded
    if (!centerEmail) {
      console.log('No center email, fetching...');
      await fetchCenterEmail();
      return; // Let the useEffect trigger another render
    }

    if (!centerEmail || !validateEmail(centerEmail)) {
      console.error('Invalid email address:', centerEmail);
      toast({
        title: "Invalid Email Address",
        description: "The center email address is missing or invalid. Please contact your tutoring center directly.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const subject = `Schedule Change – ${studentName}`;
      const body = buildEmailBody();
      
      console.log('Email params:', { to: centerEmail, subject, body });
      
      const emailParams = {
        to: centerEmail,
        subject,
        body,
      };

      // Check URI length to prevent issues
      const testMailto = `mailto:${centerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      if (testMailto.length > 2000) {
        console.warn('Email content too long:', testMailto.length);
        toast({
          title: "Message Too Long",
          description: "The message content is too long. Please shorten your reason or notes.",
          variant: "destructive",
        });
        return;
      }

      console.log('Opening email with preference:', prefer);
      openEmailWithPreference(emailParams, prefer);
      
      toast({
        title: "Email Opened",
        description: `Opening email to ${centerEmail}. Please send the email from your email app.`,
      });

    } catch (error) {
      console.error('Failed to open email:', error);
      toast({
        title: "Email Error",
        description: "Failed to open email client. Please try again or contact the center directly.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isButtonDisabled = disabled || isLoading || isEmailLoading || !studentName.trim();
  
  return (
    <Button 
      onClick={handleEmailCompose}
      disabled={isButtonDisabled}
      className={`w-full ${className}`}
      type="button"
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Opening Email...
        </>
      ) : isEmailLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading Email...
        </>
      ) : (
        <>
          <Mail className="mr-2 h-4 w-4" />
          Email Home Center
        </>
      )}
    </Button>
  );
}

/**
 * Replace the existing submit schedule change request with email compose
 */
export function replaceSubmitWithEmail(
  inquiryId: string | number, 
  studentName: string, 
  details: ScheduleChangeDetails,
  prefer?: 'auto' | 'gmail' | 'mailto' | 'outlook'
) {
  return (
    <EmailButton 
      inquiryId={inquiryId}
      studentName={studentName}
      details={details}
      prefer={prefer}
    />
  );
}

export default EmailButton;