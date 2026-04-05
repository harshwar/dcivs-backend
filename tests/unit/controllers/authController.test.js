/**
 * Unit Tests — Auth Controller
 * Tests register, login, verifyEmail, changePassword, forgotPassword, resetPassword
 */

// ─── Mock External Dependencies ──────────────────
jest.mock('../../../db', () => {
  const { createMockSupabase } = require('../../helpers/mockSupabase');
  const { mockClient } = createMockSupabase();
  return mockClient;
});

jest.mock('../../../services/emailService', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
  sendSecurityAlertEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../services/walletService', () => ({
  createEncryptedWallet: jest.fn().mockResolvedValue({
    address: '0xNewWalletAddress',
    encryptedJson: '{"encrypted": true}',
  }),
}));

jest.mock('../../../services/activityLogger', () => ({
  logActivity: jest.fn(),
}));

jest.mock('../../../middleware/rateLimiter', () => ({
  checkLockout: jest.fn().mockReturnValue({ locked: false, attempts: 0 }),
  recordFailedAttempt: jest.fn().mockReturnValue({ locked: false, attemptsRemaining: 4 }),
  resetAttempts: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const { register, login, verifyEmail, changePassword, forgotPassword, resetPassword, resendVerificationEmail } = require('../../../controllers/authController');
const supabase = require('../../../db');
const { HASHED_PASSWORD, students, admins } = require('../../fixtures/testData');

describe('Auth Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      headers: {},
      user: null,
      connection: { remoteAddress: '127.0.0.1' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  // ─── REGISTER ─────────────────────────────────────

  describe('register', () => {
    it('should return 400 when required fields are missing', async () => {
      req.body = { email: 'test@test.com' }; // missing other fields

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('required') })
      );
    });

    it('should return 400 for invalid student ID format', async () => {
      req.body = {
        email: 'test@test.com',
        password: 'password123',
        full_name: 'Test User',
        student_id_number: 'INVALID_FORMAT',
        course_name: 'BSCIT',
        year: 'TY',
      };

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Invalid Student ID') })
      );
    });

    it('should return 409 when email already exists', async () => {
      req.body = {
        email: 'existing@test.com',
        password: 'password123',
        full_name: 'Test User',
        student_id_number: '25TYBSCIT010',
        course_name: 'BSCIT',
        year: 'TY',
      };

      // First select (email check) returns existing user
      const builder = supabase.from('students');
      builder._setResult({ id: 1 });

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Email already registered.' })
      );
    });

    it('should return 201 and register student successfully', async () => {
      req.body = {
        email: 'new@test.com',
        password: 'password123',
        full_name: 'New User',
        student_id_number: '25TYBSCIT099',
        course_name: 'BSCIT',
        year: 'TY',
      };

      // Email check returns null (not found), roll check returns null, insert succeeds
      const builder = supabase.from('students');
      builder.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null }) // email check
        .mockResolvedValueOnce({ data: null, error: null }); // roll check
      builder.single.mockResolvedValueOnce({
        data: { id: 99, email: 'new@test.com', full_name: 'New User', status: 'PENDING_EMAIL' },
        error: null,
      });

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Registration successful'),
          user: expect.objectContaining({ status: 'PENDING_EMAIL' }),
        })
      );
    });
  });

  // ─── LOGIN ────────────────────────────────────────

  describe('login', () => {
    it('should return 400 when email or password missing', async () => {
      req.body = { email: 'test@test.com' }; // missing password

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should accept backup admin credentials', async () => {
      req.body = { email: 'backup_admin@test.com', password: 'admin_backup_123' };

      await login(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Backup Admin Login successful.',
          token: expect.any(String),
          user: expect.objectContaining({ role: 'admin' }),
        })
      );
    });

    it('should return 429 when account is locked', async () => {
      const rateLimiter = require('../../../middleware/rateLimiter');
      rateLimiter.checkLockout.mockReturnValueOnce({ locked: true, remainingMs: 300000 });

      req.body = { email: 'locked@test.com', password: 'password123' };

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ locked: true })
      );
    });

    it('should return 401 for invalid credentials (user not found)', async () => {
      req.body = { email: 'nobody@test.com', password: 'password123' };

      const builder = supabase.from('students');
      builder.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null }) // admin check
        .mockResolvedValueOnce({ data: null, error: null }); // student check

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 for PENDING_EMAIL status', async () => {
      req.body = { email: 'pending@test.com', password: 'password123' };

      // Admin lookup returns null
      const builder = supabase.from('admins');
      builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      // Student lookup returns pending student
      const studentBuilder = supabase.from('students');
      studentBuilder.maybeSingle.mockResolvedValueOnce({
        data: { ...students.pendingEmail, password: HASHED_PASSWORD },
        error: null,
      });

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'PENDING_EMAIL' })
      );
    });

    it('should return requires2FA when TOTP is enabled', async () => {
      req.body = { email: 'twofactor@test.com', password: 'password123' };

      const builder = supabase.from('admins');
      builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const studentBuilder = supabase.from('students');
      studentBuilder.maybeSingle.mockResolvedValueOnce({
        data: { ...students.with2FA, password: HASHED_PASSWORD, status: 'ACTIVE' },
        error: null,
      });

      await login(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requires2FA: true,
          tempToken: expect.any(String),
        })
      );
    });
  });

  // ─── VERIFY EMAIL ─────────────────────────────────

  describe('verifyEmail', () => {
    it('should return 400 when token is missing', async () => {
      req.query = {};

      await verifyEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for invalid token', async () => {
      req.query = { token: 'invalid-token' };

      const builder = supabase.from('students');
      builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      await verifyEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should verify email and transition to PENDING_APPROVAL', async () => {
      req.query = { token: 'valid-token-123' };

      const builder = supabase.from('students');
      builder.maybeSingle.mockResolvedValueOnce({
        data: { id: 2, email: 'pending@test.com', full_name: 'Pending', status: 'PENDING_EMAIL' },
        error: null,
      });

      // The update call should succeed
      builder.then.mockImplementation((resolve) =>
        resolve({ data: null, error: null })
      );

      await verifyEmail(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Email verified'),
          nextStep: 'APPROVAL',
        })
      );
    });
  });

  // ─── CHANGE PASSWORD ──────────────────────────────

  describe('changePassword', () => {
    it('should return 400 when oldPassword or newPassword missing', async () => {
      req.user = { id: 1 };
      req.body = { oldPassword: 'old' };

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when new password is less than 6 chars', async () => {
      req.user = { id: 1 };
      req.body = { oldPassword: 'password123', newPassword: '123' };

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('6 characters') })
      );
    });

    it('should return 401 when old password is incorrect', async () => {
      req.user = { id: 1 };
      req.body = { oldPassword: 'wrongpassword', newPassword: 'newpass123' };

      const builder = supabase.from('students');
      builder.single.mockResolvedValueOnce({
        data: { id: 1, password: HASHED_PASSWORD },
        error: null,
      });

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should change password successfully', async () => {
      req.user = { id: 1 };
      req.body = { oldPassword: 'password123', newPassword: 'newpass123' };

      const builder = supabase.from('students');
      builder.single.mockResolvedValueOnce({
        data: { id: 1, password: HASHED_PASSWORD },
        error: null,
      });

      // Update should succeed
      builder.then.mockImplementation((resolve) =>
        resolve({ data: null, error: null })
      );

      await changePassword(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Password changed successfully.' })
      );
    });
  });

  // ─── FORGOT PASSWORD ──────────────────────────────

  describe('forgotPassword', () => {
    it('should return 400 when email is missing', async () => {
      req.body = {};

      await forgotPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return success even for non-existent email (prevents enumeration)', async () => {
      req.body = { email: 'nonexistent@test.com' };

      const builder = supabase.from('students');
      builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      await forgotPassword(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('If an account'),
        })
      );
    });
  });

  // ─── RESET PASSWORD ───────────────────────────────

  describe('resetPassword', () => {
    it('should return 400 when token or newPassword is missing', async () => {
      req.body = { token: 'abc' };

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when password is less than 6 chars', async () => {
      req.body = { token: 'abc', newPassword: '12345' };

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for invalid reset token', async () => {
      req.body = { token: 'nonexistent-token', newPassword: 'newpass123' };

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Invalid or expired') })
      );
    });
  });

  // ─── RESEND VERIFICATION ──────────────────────────

  describe('resendVerificationEmail', () => {
    it('should return 400 when email is missing', async () => {
      req.body = {};

      await resendVerificationEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return success message even if user not found (prevents enumeration)', async () => {
      req.body = { email: 'nonexistent@test.com' };

      const builder = supabase.from('students');
      builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      await resendVerificationEmail(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('pending verification'),
        })
      );
    });
  });
});
