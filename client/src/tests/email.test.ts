// Unit tests for email helpers
// TODO: Convert to proper testing framework (Jest/Vitest)

import { 
  buildMailto, 
  buildGmailWebCompose, 
  buildGmailAppCompose,
  buildOutlookWebCompose,
  isMobile,
  truncateEmailContent
} from '../email';

// Mock user agent for testing
function mockUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', {
    get: () => userAgent,
    configurable: true
  });
}

// Test data
const testEmailParams = {
  to: 'center@example.com',
  cc: 'manager@example.com',
  bcc: 'admin@example.com',
  subject: 'Schedule Change – Benjamin Golden',
  body: 'Student: Benjamin Golden\r\nCurrent: Monday 3:00 PM\r\nRequested: Tuesday 4:00 PM\r\nReason: Soccer practice conflict\r\nEffective Date: 2025-08-20\r\n\r\n— Sent from Parent Portal'
};

// Test buildMailto function
export function testBuildMailto() {
  console.log('Testing buildMailto...');
  
  const result = buildMailto(testEmailParams);
  
  // Check that it starts with mailto:
  if (!result.startsWith('mailto:')) {
    throw new Error('buildMailto should start with mailto:');
  }
  
  // Check that it contains the email address
  if (!result.includes(encodeURIComponent(testEmailParams.to))) {
    throw new Error('buildMailto should contain the to address');
  }
  
  // Check that it contains subject and body
  if (!result.includes('subject=') || !result.includes('body=')) {
    throw new Error('buildMailto should contain subject and body parameters');
  }
  
  console.log('✓ buildMailto test passed');
  console.log('Sample output:', result.substring(0, 100) + '...');
}

// Test buildGmailWebCompose function
export function testBuildGmailWebCompose() {
  console.log('Testing buildGmailWebCompose...');
  
  const result = buildGmailWebCompose(testEmailParams);
  
  // Check that it starts with Gmail URL
  if (!result.startsWith('https://mail.google.com/mail/')) {
    throw new Error('buildGmailWebCompose should start with Gmail URL');
  }
  
  // Check required parameters
  if (!result.includes('view=cm') || !result.includes('fs=1')) {
    throw new Error('buildGmailWebCompose should contain required Gmail parameters');
  }
  
  // Check that email params are included
  if (!result.includes('to=') || !result.includes('su=') || !result.includes('body=')) {
    throw new Error('buildGmailWebCompose should contain email parameters');
  }
  
  console.log('✓ buildGmailWebCompose test passed');
  console.log('Sample output:', result.substring(0, 100) + '...');
}

// Test buildGmailAppCompose function
export function testBuildGmailAppCompose() {
  console.log('Testing buildGmailAppCompose...');
  
  // Test iOS
  mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
  const iosResult = buildGmailAppCompose(testEmailParams);
  
  if (!iosResult.startsWith('googlegmail://co?')) {
    throw new Error('buildGmailAppCompose should use googlegmail scheme for iOS');
  }
  
  // Test Android
  mockUserAgent('Mozilla/5.0 (Linux; Android 10)');
  const androidResult = buildGmailAppCompose(testEmailParams);
  
  if (!androidResult.startsWith('gmail://co?')) {
    throw new Error('buildGmailAppCompose should use gmail scheme for Android');
  }
  
  // Check that CRLF is used in body
  if (!iosResult.includes('%0D%0A')) { // URL encoded CRLF
    throw new Error('buildGmailAppCompose should use CRLF in body');
  }
  
  console.log('✓ buildGmailAppCompose test passed');
  console.log('iOS sample:', iosResult.substring(0, 50) + '...');
  console.log('Android sample:', androidResult.substring(0, 50) + '...');
}

// Test buildOutlookWebCompose function
export function testBuildOutlookWebCompose() {
  console.log('Testing buildOutlookWebCompose...');
  
  const result = buildOutlookWebCompose(testEmailParams);
  
  if (!result.startsWith('https://outlook.office.com/mail/deeplink/compose?')) {
    throw new Error('buildOutlookWebCompose should start with Outlook URL');
  }
  
  if (!result.includes('to=') || !result.includes('subject=') || !result.includes('body=')) {
    throw new Error('buildOutlookWebCompose should contain email parameters');
  }
  
  console.log('✓ buildOutlookWebCompose test passed');
  console.log('Sample output:', result.substring(0, 100) + '...');
}

// Test isMobile function
export function testIsMobile() {
  console.log('Testing isMobile...');
  
  // Test desktop user agent
  mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  if (isMobile()) {
    throw new Error('isMobile should return false for desktop user agent');
  }
  
  // Test iPhone user agent
  mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
  if (!isMobile()) {
    throw new Error('isMobile should return true for iPhone user agent');
  }
  
  // Test Android user agent
  mockUserAgent('Mozilla/5.0 (Linux; Android 10)');
  if (!isMobile()) {
    throw new Error('isMobile should return true for Android user agent');
  }
  
  console.log('✓ isMobile test passed');
}

// Test truncateEmailContent function
export function testTruncateEmailContent() {
  console.log('Testing truncateEmailContent...');
  
  const shortContent = 'Short message';
  const shortResult = truncateEmailContent(shortContent, 100);
  
  if (shortResult !== shortContent) {
    throw new Error('truncateEmailContent should not modify short content');
  }
  
  const longContent = 'A'.repeat(2000);
  const longResult = truncateEmailContent(longContent, 100);
  
  if (longResult.length > 120) { // 100 + '(truncated)' text
    throw new Error('truncateEmailContent should limit content length');
  }
  
  if (!longResult.includes('(truncated)')) {
    throw new Error('truncateEmailContent should add truncation indicator');
  }
  
  console.log('✓ truncateEmailContent test passed');
}

// Test URL encoding
export function testUrlEncoding() {
  console.log('Testing URL encoding...');
  
  const specialChars = {
    to: 'test+email@example.com',
    subject: 'Subject with spaces & special chars!',
    body: 'Body with\nnew lines\nand & symbols'
  };
  
  const mailtoResult = buildMailto(specialChars);
  const gmailResult = buildGmailWebCompose(specialChars);
  
  // Check that special characters are properly encoded
  if (mailtoResult.includes(' ') || gmailResult.includes(' ')) {
    throw new Error('URLs should not contain unencoded spaces');
  }
  
  if (!mailtoResult.includes('%40') || !gmailResult.includes('%40')) {
    throw new Error('@ symbols should be URL encoded');
  }
  
  console.log('✓ URL encoding test passed');
}

// Run all tests
export function runAllEmailTests() {
  console.log('Running email helper tests...\n');
  
  try {
    testBuildMailto();
    testBuildGmailWebCompose();
    testBuildGmailAppCompose();
    testBuildOutlookWebCompose();
    testIsMobile();
    testTruncateEmailContent();
    testUrlEncoding();
    
    console.log('\n✅ All email tests passed!');
    return { success: true };
  } catch (error) {
    console.error('\n❌ Email tests failed:', error);
    return { success: false, error };
  }
}

// Example test scenarios for manual verification:
export const manualTestScenarios = {
  basicMailto: () => buildMailto({ 
    to: 'test@example.com', 
    subject: 'Test Subject', 
    body: 'Test body' 
  }),
  
  complexGmail: () => buildGmailWebCompose({
    to: 'center@franchise.com',
    cc: 'manager@franchise.com',
    subject: 'Schedule Change Request',
    body: 'Student: John Doe\nCurrent: Monday 3:00 PM\nRequested: Tuesday 4:00 PM'
  }),
  
  mobileGmailApp: () => buildGmailAppCompose({
    to: 'center@franchise.com',
    subject: 'Schedule Change Request',
    body: 'Mobile app deep link test\nWith CRLF line breaks'
  })
};