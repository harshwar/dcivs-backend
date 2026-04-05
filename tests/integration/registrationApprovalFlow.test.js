/**
 * Integration Tests — Registration → Approval → Wallet Creation Flow
 * Tests the full student lifecycle from registration to active status.
 */

jest.mock('../../db', () => {
  const { createMockSupabase } = require('../helpers/mockSupabase');
  const { mockClient } = createMockSupabase();
  return mockClient;
});

jest.mock('../../services/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
  sendAccountActivationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendSecurityAlertEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../services/walletService', () => ({
  createEncryptedWallet: jest.fn().mockResolvedValue({
    address: '0xCreatedWalletAddr',
    encryptedJson: '{"version":3,"crypto":{}}',
  }),
}));

jest.mock('../../services/activityLogger', () => ({
  logActivity: jest.fn(),
}));

jest.mock('../../middleware/rateLimiter', () => ({
  checkLockout: jest.fn().mockReturnValue({ locked: false, attempts: 0 }),
  recordFailedAttempt: jest.fn().mockReturnValue({ locked: false, attemptsRemaining: 4 }),
  resetAttempts: jest.fn(),
}));

const { register, verifyEmail, login } = require('../../controllers/authController');
const { approveStudent } = require('../../controllers/adminController');
const supabase = require('../../db');
const { createEncryptedWallet } = require('../../services/walletService');

describe('Integration: Registration → Approval Flow', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      user: null,
      headers: {},
      connection: { remoteAddress: '127.0.0.1' },
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  it('should register student → verify email → admin approve → create wallet', async () => {
    // ── Step 1: Register ──
    req.body = {
      email: 'flow@test.com',
      password: 'password123',
      full_name: 'Flow Student',
      student_id_number: '25TYBSCIT050',
      course_name: 'BSCIT',
      year: 'TY',
    };

    const studentsBuilder = supabase.from('students');
    // Email check → not found
    studentsBuilder.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    // Insert → success
    studentsBuilder.single.mockResolvedValueOnce({
      data: { id: 50, email: 'flow@test.com', full_name: 'Flow Student', status: 'PENDING_EMAIL' },
      error: null,
    });

    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(201);

    // ── Step 2: Verify Email ──
    jest.clearAllMocks();
    req.query = { token: 'verify-token-for-flow' };

    studentsBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 50, email: 'flow@test.com', full_name: 'Flow Student', status: 'PENDING_EMAIL' },
      error: null,
    });
    // Update status
    studentsBuilder.then.mockImplementation((resolve) =>
      resolve({ data: null, error: null })
    );

    await verifyEmail(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ nextStep: 'APPROVAL' })
    );

    // ── Step 3: Admin Approve ──
    jest.clearAllMocks();
    req.params = { id: 50 };
    req.user = { id: 100, role: 'admin' };

    studentsBuilder.single.mockResolvedValueOnce({
      data: { id: 50, email: 'flow@test.com', full_name: 'Flow Student', status: 'PENDING_APPROVAL' },
      error: null,
    });

    // Update student status to ACTIVE
    studentsBuilder.then.mockImplementation((resolve) =>
      resolve({ data: null, error: null })
    );

    // Wallet insert
    const walletsBuilder = supabase.from('wallets');
    walletsBuilder.then.mockImplementation((resolve) =>
      resolve({ data: {}, error: null })
    );

    await approveStudent(req, res);

    expect(createEncryptedWallet).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('approved'),
      })
    );
  });

  it('should prevent login for PENDING_EMAIL student', async () => {
    req.body = { email: 'pending@test.com', password: 'password123' };

    const adminsBuilder = supabase.from('admins');
    adminsBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const studentsBuilder = supabase.from('students');
    const bcrypt = require('bcryptjs');
    studentsBuilder.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 2,
        email: 'pending@test.com',
        full_name: 'Pending',
        password: bcrypt.hashSync('password123', 10),
        status: 'PENDING_EMAIL',
        totp_enabled: false,
      },
      error: null,
    });

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PENDING_EMAIL' })
    );
  });
});
