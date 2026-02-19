/**
 * Email Service Tests
 * Tests for email functionality with mocked transport
 */

// Mock nodemailer before importing the service
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id-123' }),
    verify: jest.fn().mockResolvedValue(true)
  })
}));

// Set required env vars
process.env.GMAIL_USER = 'test@gmail.com';
process.env.GMAIL_APP_PASSWORD = 'testpassword';
process.env.FRONTEND_URL = 'http://localhost:5173';

const { 
  sendWelcomeEmail, 
  sendCertificateIssuedEmail, 
  sendTestEmail,
  verifyEmailConfig 
} = require('../services/emailService');

const nodemailer = require('nodemailer');

describe('Email Service', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // WELCOME EMAIL
  // ============================================

  describe('sendWelcomeEmail', () => {

    test('should send welcome email to new student', async () => {
      const student = {
        email: 'student@example.com',
        full_name: 'Test Student'
      };

      const result = await sendWelcomeEmail(student);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-message-id-123');
    });

    test('should include student name in email', async () => {
      const student = {
        email: 'student@example.com',
        full_name: 'John Doe'
      };

      await sendWelcomeEmail(student);

      const mockTransport = nodemailer.createTransport();
      const sendMailCall = mockTransport.sendMail.mock.calls[0][0];
      
      expect(sendMailCall.to).toBe('student@example.com');
      expect(sendMailCall.html).toContain('John Doe');
    });

    test('should handle send failure gracefully', async () => {
      const mockTransport = nodemailer.createTransport();
      mockTransport.sendMail.mockRejectedValueOnce(new Error('SMTP Error'));

      const result = await sendWelcomeEmail({
        email: 'student@example.com',
        full_name: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP Error');
    });

  });

  // ============================================
  // CERTIFICATE ISSUED EMAIL
  // ============================================

  describe('sendCertificateIssuedEmail', () => {

    test('should send certificate notification', async () => {
      const params = {
        email: 'student@example.com',
        studentName: 'Test Student',
        certificateTitle: 'Bachelor of Science',
        tokenId: '123',
        transactionHash: '0xabc123',
        department: 'Computer Science'
      };

      const result = await sendCertificateIssuedEmail(params);

      expect(result.success).toBe(true);
    });

    test('should include certificate details in email', async () => {
      const params = {
        email: 'student@example.com',
        studentName: 'Jane Smith',
        certificateTitle: 'Master of Arts',
        tokenId: '456',
        transactionHash: '0xdef789',
        department: 'Liberal Arts'
      };

      await sendCertificateIssuedEmail(params);

      const mockTransport = nodemailer.createTransport();
      const sendMailCall = mockTransport.sendMail.mock.calls[0][0];
      
      expect(sendMailCall.html).toContain('Jane Smith');
      expect(sendMailCall.html).toContain('Master of Arts');
      expect(sendMailCall.html).toContain('456');
      expect(sendMailCall.subject).toContain('Master of Arts');
    });

  });

  // ============================================
  // TEST EMAIL
  // ============================================

  describe('sendTestEmail', () => {

    test('should send test email', async () => {
      const result = await sendTestEmail('test@example.com');

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

  });

  // ============================================
  // EMAIL CONFIGURATION
  // ============================================

  describe('verifyEmailConfig', () => {

    test('should verify email configuration', async () => {
      const result = await verifyEmailConfig();

      expect(result.success).toBe(true);
    });

    test('should report configuration failure', async () => {
      const mockTransport = nodemailer.createTransport();
      mockTransport.verify.mockRejectedValueOnce(new Error('Auth failed'));

      const result = await verifyEmailConfig();

      expect(result.success).toBe(false);
    });

  });

});
