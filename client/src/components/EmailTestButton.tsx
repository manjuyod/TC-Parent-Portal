import { Button } from '@/components/ui/button';
import { openEmailWithPreference } from '../email';

export function EmailTestButton() {
  const handleTestEmail = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('Test email button clicked');
    
    const testEmailParams = {
      to: 'test@example.com',
      subject: 'Test Email Subject',
      body: 'This is a test email body\nWith multiple lines\nTo test the email functionality.'
    };
    
    console.log('Calling openEmailWithPreference with:', testEmailParams);
    
    try {
      openEmailWithPreference(testEmailParams, 'mailto');
      console.log('openEmailWithPreference called successfully');
    } catch (error) {
      console.error('Error calling openEmailWithPreference:', error);
    }
  };

  return (
    <Button onClick={handleTestEmail} type="button" className="mb-4">
      Test Email (mailto)
    </Button>
  );
}