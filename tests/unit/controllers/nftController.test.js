/**
 * Unit Tests — NFT Controller
 * Tests startIssuance, issueNFT (legacy), startBatchIssuance, getWalletInfo
 */

// Mock external dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  unlinkSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('mock-file')),
  writeFileSync: jest.fn(),
}));

jest.mock('../../../db', () => {
  const { createMockSupabase } = require('../../helpers/mockSupabase');
  const { mockClient } = createMockSupabase();
  return mockClient;
});

jest.mock('../../../utils/pinataHelpers', () => ({
  pinFileToIPFS: jest.fn().mockResolvedValue('QmImageCID123'),
  pinJSONToIPFS: jest.fn().mockResolvedValue('QmMetadataCID456'),
}));

jest.mock('../../../services/blockchainService', () => ({
  mintNFT: jest.fn().mockResolvedValue({
    tokenId: '1',
    transactionHash: '0xmocktxhash',
  }),
  getAdminWalletInfo: jest.fn().mockResolvedValue({
    address: '0xAdmin',
    balance: '10.0',
    estimatedGas: { mint: '0.002' },
  }),
}));

jest.mock('../../../services/emailService', () => ({
  sendCertificateIssuedEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../services/jobService', () => ({
  createJob: jest.fn().mockResolvedValue('job-uuid-123'),
  updateJobStep: jest.fn().mockResolvedValue(),
  completeJob: jest.fn().mockResolvedValue(),
  failJob: jest.fn().mockResolvedValue(),
}));

jest.mock('../../../services/activityLogger', () => ({
  logActivity: jest.fn(),
}));

const { issueNFT, startIssuance, getWalletInfo } = require('../../../controllers/nftController');
const supabase = require('../../../db');
const { pinFileToIPFS, pinJSONToIPFS } = require('../../../utils/pinataHelpers');
const { mintNFT } = require('../../../services/blockchainService');
const { createJob, completeJob, failJob } = require('../../../services/jobService');

describe('NFT Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      file: null,
      user: { id: 100 },
      headers: {},
      connection: { remoteAddress: '127.0.0.1' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  // ─── issueNFT (Legacy) ────────────────────────

  describe('issueNFT (legacy synchronous)', () => {
    it('should return 400 when file is missing', async () => {
      req.body = { recipientId: '1', title: 'Award' };
      req.file = null;

      await issueNFT(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Certificate file is required.' })
      );
    });

    it('should return 400 when recipientId is missing', async () => {
      req.body = { title: 'Award' };
      req.file = { path: '/tmp/test.png', originalname: 'cert.png' };

      await issueNFT(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Student (Recipient) is required.' })
      );
    });

    it('should return 400 when title is missing', async () => {
      req.body = { recipientId: '1' };
      req.file = { path: '/tmp/test.png', originalname: 'cert.png' };

      await issueNFT(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when student not found', async () => {
      req.body = { recipientId: '999', title: 'Award' };
      req.file = { path: '/tmp/test.png', originalname: 'cert.png' };

      const builder = supabase.from('students');
      builder.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

      await issueNFT(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 when student has no wallet address', async () => {
      req.body = { recipientId: '1', title: 'Award' };
      req.file = { path: '/tmp/test.png', originalname: 'cert.png' };

      const builder = supabase.from('students');
      builder.single.mockResolvedValueOnce({
        data: { ethereum_address: null, email: 'test@test.com', full_name: 'Test' },
        error: null,
      });

      await issueNFT(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('wallet address') })
      );
    });

    it('should issue NFT successfully and return 201', async () => {
      req.body = { recipientId: '1', title: 'CS Award', department: 'IT' };
      req.file = { path: '/tmp/test.png', originalname: 'cert.png' };

      // Student lookup
      const studentsBuilder = supabase.from('students');
      studentsBuilder.single.mockResolvedValueOnce({
        data: { ethereum_address: '0xAddr', email: 'student@test.com', full_name: 'Student' },
        error: null,
      });

      // Certificate insert
      const certsBuilder = supabase.from('certificates');
      certsBuilder.single.mockResolvedValueOnce({
        data: { id: 10 },
        error: null,
      });

      // NFT insert
      const nftsBuilder = supabase.from('nfts');
      nftsBuilder.then.mockImplementation((resolve) =>
        resolve({ data: {}, error: null })
      );

      await issueNFT(req, res);

      expect(pinFileToIPFS).toHaveBeenCalled();
      expect(pinJSONToIPFS).toHaveBeenCalled();
      expect(mintNFT).toHaveBeenCalledWith('0xAddr', expect.stringContaining('ipfs://'));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'NFT issued successfully!',
          nft: expect.objectContaining({
            tokenId: '1',
            transactionHash: '0xmocktxhash',
          }),
        })
      );
    });
  });

  // ─── startIssuance (Async) ────────────────────

  describe('startIssuance (async)', () => {
    it('should return 400 when file is missing', async () => {
      req.body = { recipientId: '1', title: 'Award' };
      req.file = null;

      await startIssuance(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 202 with jobId for valid request', async () => {
      req.body = { recipientId: '1', title: 'Award' };
      req.file = { path: '/tmp/test.png', originalname: 'cert.png' };

      await startIssuance(req, res);

      expect(createJob).toHaveBeenCalledWith('issue_nft', 5, expect.any(Object), 100);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-uuid-123',
          message: expect.stringContaining('Issuance started'),
        })
      );
    });
  });

  // ─── getWalletInfo ────────────────────────────

  describe('getWalletInfo', () => {
    it('should return wallet info from blockchain service', async () => {
      await getWalletInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '0xAdmin',
          balance: '10.0',
        })
      );
    });

    it('should return 500 when blockchain service fails', async () => {
      const { getAdminWalletInfo } = require('../../../services/blockchainService');
      getAdminWalletInfo.mockRejectedValueOnce(new Error('RPC timeout'));

      await getWalletInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
