/**
 * Pipeline Tests — NFT Issuance Pipeline
 * Tests the async runIssuancePipeline function step by step.
 */

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  unlinkSync: jest.fn(),
}));

jest.mock('../../db', () => {
  const { createMockSupabase } = require('../helpers/mockSupabase');
  const { mockClient } = createMockSupabase();
  return mockClient;
});

jest.mock('../../utils/pinataHelpers', () => ({
  pinFileToIPFS: jest.fn().mockResolvedValue('QmImageHash'),
  pinJSONToIPFS: jest.fn().mockResolvedValue('QmMetaHash'),
}));

jest.mock('../../services/blockchainService', () => ({
  mintNFT: jest.fn().mockResolvedValue({ tokenId: '42', transactionHash: '0xtxhash' }),
}));

jest.mock('../../services/emailService', () => ({
  sendCertificateIssuedEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../services/jobService', () => ({
  createJob: jest.fn().mockResolvedValue('pipeline-job-123'),
  updateJobStep: jest.fn().mockResolvedValue(),
  completeJob: jest.fn().mockResolvedValue(),
  failJob: jest.fn().mockResolvedValue(),
}));

jest.mock('../../services/activityLogger', () => ({
  logActivity: jest.fn(),
}));

const supabase = require('../../db');
const { pinFileToIPFS, pinJSONToIPFS } = require('../../utils/pinataHelpers');
const { mintNFT } = require('../../services/blockchainService');
const { updateJobStep, completeJob, failJob } = require('../../services/jobService');

// We need to access the internal runIssuancePipeline function
// Since it's not exported, we test it indirectly through startIssuance
// OR we use module internals pattern. For this test, we'll invoke startIssuance
// and verify the pipeline's side effects.
const { startIssuance } = require('../../controllers/nftController');

describe('Pipeline: NFT Issuance', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: { recipientId: '1', title: 'CS Award', department: 'IT', description: 'Test cert' },
      file: { path: '/tmp/test.png', originalname: 'cert.png' },
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

  it('should return 202 immediately with jobId', async () => {
    await startIssuance(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'pipeline-job-123' })
    );
  });

  it('should execute pipeline steps in background', async () => {
    // Setup mocks for successful pipeline
    const studentsBuilder = supabase.from('students');
    studentsBuilder.single.mockResolvedValue({
      data: { ethereum_address: '0xStudentAddr', email: 's@test.com', full_name: 'Student' },
      error: null,
    });

    const certsBuilder = supabase.from('certificates');
    certsBuilder.single.mockResolvedValue({
      data: { id: 10 },
      error: null,
    });

    const nftsBuilder = supabase.from('nfts');
    nftsBuilder.then.mockImplementation((resolve) =>
      resolve({ data: {}, error: null })
    );

    await startIssuance(req, res);

    // Wait for pipeline to execute
    await new Promise((r) => setTimeout(r, 100));

    // Verify pipeline steps were called
    expect(updateJobStep).toHaveBeenCalledWith('pipeline-job-123', 1, expect.any(String), 10);
    expect(pinFileToIPFS).toHaveBeenCalled();
    expect(pinJSONToIPFS).toHaveBeenCalled();
    expect(mintNFT).toHaveBeenCalledWith('0xStudentAddr', expect.stringContaining('ipfs://'));
    expect(completeJob).toHaveBeenCalledWith(
      'pipeline-job-123',
      expect.objectContaining({
        tokenId: '42',
        transactionHash: '0xtxhash',
      })
    );
  });

  it('should call failJob when student not found', async () => {
    const studentsBuilder = supabase.from('students');
    studentsBuilder.single.mockResolvedValue({
      data: null,
      error: { message: 'Not found' },
    });

    await startIssuance(req, res);

    // Wait for pipeline to execute
    await new Promise((r) => setTimeout(r, 100));

    expect(failJob).toHaveBeenCalledWith(
      'pipeline-job-123',
      expect.stringContaining('Student not found')
    );
  });

  it('should call failJob when IPFS upload fails', async () => {
    const studentsBuilder = supabase.from('students');
    studentsBuilder.single.mockResolvedValue({
      data: { ethereum_address: '0xAddr', email: 's@test.com', full_name: 'S' },
      error: null,
    });

    pinFileToIPFS.mockRejectedValueOnce(new Error('Pinata timeout'));

    await startIssuance(req, res);

    await new Promise((r) => setTimeout(r, 100));

    expect(failJob).toHaveBeenCalledWith(
      'pipeline-job-123',
      expect.stringContaining('Pinata timeout')
    );
  });

  it('should call failJob when blockchain mint fails', async () => {
    const studentsBuilder = supabase.from('students');
    studentsBuilder.single.mockResolvedValue({
      data: { ethereum_address: '0xAddr', email: 's@test.com', full_name: 'S' },
      error: null,
    });

    mintNFT.mockRejectedValueOnce(new Error('Transaction reverted'));

    await startIssuance(req, res);

    await new Promise((r) => setTimeout(r, 100));

    expect(failJob).toHaveBeenCalledWith(
      'pipeline-job-123',
      expect.stringContaining('Transaction reverted')
    );
  });
});
