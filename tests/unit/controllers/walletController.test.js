/**
 * Unit Tests — Wallet Controller
 */
jest.mock('../../../db', () => {
  const { createMockSupabase } = require('../../helpers/mockSupabase');
  const { mockClient } = createMockSupabase();
  return mockClient;
});

jest.mock('../../../services/walletService', () => ({
  createEncryptedWallet: jest.fn().mockResolvedValue({
    address: '0xNewWalletAddress123',
    encryptedJson: '{"version":3}',
  }),
  decryptWallet: jest.fn().mockResolvedValue({
    address: '0xNewWalletAddress123',
    privateKey: '0xprivatekey',
  }),
}));

jest.mock('../../../services/activityLogger', () => ({
  logActivity: jest.fn(),
}));

const { createWallet, getWallet } = require('../../../controllers/walletController');
const supabase = require('../../../db');
const { createEncryptedWallet } = require('../../../services/walletService');

describe('Wallet Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      user: { id: 1, email: 'student@test.com' },
      headers: {},
      connection: { remoteAddress: '127.0.0.1' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('createWallet', () => {
    it('should return 400 when password is missing', async () => {
      req.body = {};

      await createWallet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 409 when wallet already exists', async () => {
      req.body = { password: 'securepass123' };

      const builder = supabase.from('wallets');
      builder.maybeSingle.mockResolvedValueOnce({
        data: { id: 30, public_address: '0xExisting' },
        error: null,
      });

      await createWallet(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should create wallet and update student ethereum_address', async () => {
      req.body = { password: 'securepass123' };

      // No existing wallet
      const walletsBuilder = supabase.from('wallets');
      walletsBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      // Insert wallet
      walletsBuilder.single.mockResolvedValueOnce({
        data: { id: 30, public_address: '0xNewWalletAddress123' },
        error: null,
      });

      // Update student
      const studentsBuilder = supabase.from('students');
      studentsBuilder.then.mockImplementation((resolve) =>
        resolve({ data: null, error: null })
      );

      await createWallet(req, res);

      expect(createEncryptedWallet).toHaveBeenCalledWith('securepass123');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '0xNewWalletAddress123',
        })
      );
    });
  });

  describe('getWallet', () => {
    it('should return wallet data for authenticated user', async () => {
      const builder = supabase.from('wallets');
      builder.single.mockResolvedValueOnce({
        data: { public_address: '0xAddr', encrypted_json: '{}' },
        error: null,
      });

      await getWallet(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          address: expect.any(String),
        })
      );
    });

    it('should return 404 when no wallet found', async () => {
      const builder = supabase.from('wallets');
      builder.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      await getWallet(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
