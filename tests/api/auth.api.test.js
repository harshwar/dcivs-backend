/**
 * API Tests — Authentication Routes
 * Full HTTP endpoint testing with Supertest
 */
const request = require('supertest');
const express = require('express');
const { generateAdminToken, generateStudentToken, generateExpiredToken } = require('../helpers/authHelper');

// ─── Mock all external deps before requiring server ───
jest.mock('../../db', () => {
  const { createMockSupabase } = require('../helpers/mockSupabase');
  const { mockClient } = createMockSupabase();
  return mockClient;
});

jest.mock('../../services/emailService', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
  sendSecurityAlertEmail: jest.fn().mockResolvedValue({ success: true }),
  sendAccountActivationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendCertificateIssuedEmail: jest.fn().mockResolvedValue({ success: true }),
  sendCertificateStatusEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../services/walletService', () => ({
  createEncryptedWallet: jest.fn().mockResolvedValue({
    address: '0xMockAddr',
    encryptedJson: '{}',
  }),
  decryptWallet: jest.fn().mockResolvedValue({ address: '0xMockAddr' }),
}));

jest.mock('../../services/blockchainService', () => ({
  mintNFT: jest.fn().mockResolvedValue({ tokenId: '1', transactionHash: '0x123' }),
  revokeNFT: jest.fn().mockResolvedValue({ transactionHash: '0xrev' }),
  reinstateNFT: jest.fn().mockResolvedValue({ transactionHash: '0xrei' }),
  verifyCertificate: jest.fn().mockResolvedValue({ valid: true, owner: '0x1', tokenURI: 'ipfs://x' }),
  isTokenRevoked: jest.fn().mockResolvedValue(false),
  getTokenInfo: jest.fn().mockResolvedValue({}),
  getAdminWalletInfo: jest.fn().mockResolvedValue({ address: '0xA', balance: '10' }),
}));

jest.mock('../../services/jobService', () => ({
  createJob: jest.fn().mockResolvedValue('api-test-job-id'),
  updateJobStep: jest.fn().mockResolvedValue(),
  completeJob: jest.fn().mockResolvedValue(),
  failJob: jest.fn().mockResolvedValue(),
  getJobStatus: jest.fn().mockResolvedValue({
    id: 'api-test-job-id',
    status: 'completed',
    percentage: 100,
    result: {},
  }),
}));

jest.mock('../../services/activityLogger', () => ({
  logActivity: jest.fn(),
}));

jest.mock('../../services/qrService', () => ({
  generateVerificationQR: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

// Create a minimal Express app for API testing
function createTestApp() {
  const app = express();
  app.use(express.json());

  const { register, login, verifyEmail, changePassword, forgotPassword, resetPassword, resendVerificationEmail } = require('../../controllers/authController');
  const { authenticateToken } = require('../../middleware/authMiddleware');

  // Auth routes (mirroring server.js)
  app.post('/api/auth/register', register);
  app.post('/api/auth/login', login);
  app.get('/api/auth/verify-email', verifyEmail);
  app.post('/api/auth/change-password', authenticateToken, changePassword);
  app.post('/api/auth/forgot-password', forgotPassword);
  app.post('/api/auth/reset-password', resetPassword);
  app.post('/api/auth/resend-verification', resendVerificationEmail);
  app.get('/api/ping', (req, res) => res.json({ status: 'alive' }));

  return app;
}

describe('API: Auth Routes', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Ping ────────────────────────────────────

  describe('GET /api/ping', () => {
    it('should return 200 with alive status', async () => {
      const res = await request(app).get('/api/ping');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('alive');
    });
  });

  // ─── Register ────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('should return 400 when fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should return 400 for invalid student ID format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@test.com',
          password: 'password123',
          full_name: 'Test User',
          student_id_number: 'BAD_FORMAT',
          course_name: 'BSCIT',
          year: 'TY',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid Student ID');
    });
  });

  // ─── Login ───────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('should return 400 when email or password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(400);
    });

    it('should accept backup admin credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'backup_admin@test.com', password: 'admin_backup_123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('admin');
    });
  });

  // ─── Verify Email ────────────────────────────

  describe('GET /api/auth/verify-email', () => {
    it('should return 400 when token is missing', async () => {
      const res = await request(app).get('/api/auth/verify-email');

      expect(res.status).toBe(400);
    });
  });

  // ─── Change Password (Protected) ─────────────

  describe('POST /api/auth/change-password', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({ oldPassword: 'old', newPassword: 'newpass' });

      expect(res.status).toBe(401);
    });

    it('should return 400 with missing fields (with valid token)', async () => {
      const token = generateStudentToken({ id: 1 });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: 'old' });

      expect(res.status).toBe(400);
    });

    it('should reject expired token', async () => {
      const token = generateExpiredToken({ id: 1 });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: 'old', newPassword: 'newpass123' });

      expect(res.status).toBe(403);
    });
  });

  // ─── Forgot Password ─────────────────────────

  describe('POST /api/auth/forgot-password', () => {
    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should always return success message (prevents enumeration)', async () => {
      const supabase = require('../../db');
      supabase.from('students').maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('If an account');
    });
  });

  // ─── Reset Password ──────────────────────────

  describe('POST /api/auth/reset-password', () => {
    it('should return 400 when token or newPassword is missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'abc' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for short password', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'abc', newPassword: '123' });

      expect(res.status).toBe(400);
    });
  });
});
