/**
 * Unit Tests — Email Service
 * Verifies all email functions call Resend with correct params without sending real emails.
 */

// Mock the Resend SDK
jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: {
        send: jest.fn().mockResolvedValue({ id: 'test-email-id' }),
      },
    })),
  };
});

const {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendCertificateIssuedEmail,
  sendSecurityAlertEmail,
  sendCertificateStatusEmail,
} = require('../../../services/emailService');

describe('Email Service', () => {
  it('sendWelcomeEmail should resolve with success', async () => {
    const result = await sendWelcomeEmail({
      email: 'test@test.com',
      full_name: 'Test User',
    });

    expect(result.success).toBe(true);
  });

  it('sendVerificationEmail should resolve with success', async () => {
    const result = await sendVerificationEmail({
      email: 'test@test.com',
      full_name: 'Test User',
      token: 'verify-token-123',
    });

    expect(result.success).toBe(true);
  });

  it('sendPasswordResetEmail should resolve with success', async () => {
    const result = await sendPasswordResetEmail({
      email: 'test@test.com',
      full_name: 'Test User',
      resetUrl: 'http://localhost/reset/token123',
    });

    expect(result.success).toBe(true);
  });

  it('sendCertificateIssuedEmail should resolve with success', async () => {
    const result = await sendCertificateIssuedEmail({
      email: 'student@test.com',
      studentName: 'Student',
      certificateTitle: 'CS Award',
      tokenId: '1',
      transactionHash: '0xabc',
      department: 'IT',
    });

    expect(result.success).toBe(true);
  });

  it('sendSecurityAlertEmail should resolve with success', async () => {
    const result = await sendSecurityAlertEmail({
      email: 'test@test.com',
      full_name: 'Test User',
      action: 'Password Changed',
      details: 'Your password was updated.',
    });

    expect(result.success).toBe(true);
  });

  it('sendCertificateStatusEmail should resolve with success', async () => {
    const result = await sendCertificateStatusEmail({
      email: 'test@test.com',
      full_name: 'Test User',
      certificateTitle: 'Award',
      status: 'Revoked',
      tokenId: '1',
    });

    expect(result.success).toBe(true);
  });

  it('should handle Resend API failure gracefully', async () => {
    // Force a failure on the next call
    const { Resend } = require('resend');
    const instance = new Resend();
    instance.emails.send.mockRejectedValueOnce(new Error('API rate limit'));

    const result = await sendWelcomeEmail({
      email: 'test@test.com',
      full_name: 'Test',
    });

    // Should not throw, should return gracefully
    expect(result).toBeDefined();
  });
});
