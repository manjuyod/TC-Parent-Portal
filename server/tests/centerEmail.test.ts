// Basic test for center email endpoint
// TODO: Convert to proper unit tests with testing framework

import { getFranchiseCenterEmail } from "../sqlServerStorage";

// Test function for getFranchiseCenterEmail
export async function testGetFranchiseCenterEmail() {
  console.log("Testing getFranchiseCenterEmail function...");
  
  try {
    // Test with a valid inquiry ID (this would need to be a real ID in testing)
    const validInquiryId = 12345; // Replace with actual test ID
    const email = await getFranchiseCenterEmail(validInquiryId);
    
    if (email) {
      console.log(`✓ Found email for inquiry ${validInquiryId}: ${email}`);
    } else {
      console.log(`✗ No email found for inquiry ${validInquiryId}`);
    }
    
    // Test with invalid inquiry ID
    const invalidInquiryId = -1;
    const noEmail = await getFranchiseCenterEmail(invalidInquiryId);
    
    if (!noEmail) {
      console.log(`✓ Correctly returned null for invalid inquiry ${invalidInquiryId}`);
    } else {
      console.log(`✗ Unexpectedly found email for invalid inquiry ${invalidInquiryId}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error("Test failed:", error);
    return { success: false, error };
  }
}

// Endpoint test scenarios:
// 1. GET /v1/inquiries/123/center-email should return { email: "center@example.com" } for valid inquiry
// 2. GET /v1/inquiries/999999/center-email should return 404 { error: "Center email not found" } for unknown inquiry
// 3. GET /v1/inquiries/invalid/center-email should return 400 { error: "Invalid inquiry ID" } for non-numeric ID
// 4. Rate limiting: 11+ requests in 1 minute should return 429 { error: "Rate limit exceeded" }

export const testScenarios = {
  validInquiry: "Should return email for valid inquiry ID",
  invalidInquiry: "Should return 404 for unknown inquiry ID", 
  malformedId: "Should return 400 for non-numeric inquiry ID",
  rateLimiting: "Should return 429 after exceeding rate limit"
};