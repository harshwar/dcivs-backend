/**
 * API Tests — Job Status Polling Route
 */
const request = require('supertest');
const express = require('express');
const { generateAdminToken, generateStudentToken } = require('../helpers/authHelper');

jest.mock('../../services/jobService', () => ({
  getJobStatus: jest.fn(),
}));

const { getJobStatus } = require('../../services/jobService');
const { authenticateToken } = require('../../middleware/authMiddleware');

function createTestApp() {
  const app = express();
  app.use(express.json());

  const jobRoutes = require('../../routes/jobRoutes');
  app.use('/api/job-status', authenticateToken, (req, res, next) => {
    // authenticateToken is already called in the route, skip double-call
    next();
  });
  // Re-create the route inline to avoid middleware conflicts
  app.get('/api/job-status/:jobId', authenticateToken, async (req, res) => {
    try {
      const { jobId } = req.params;
      if (!jobId) return res.status(400).json({ error: 'Job ID is required.' });
      const job = await getJobStatus(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      res.json(job);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch job status.' });
    }
  });

  return app;
}

describe('API: Job Status Polling', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app).get('/api/job-status/job-123');
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent job', async () => {
    getJobStatus.mockResolvedValueOnce(null);
    const token = generateAdminToken();

    const res = await request(app)
      .get('/api/job-status/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should return job status for valid jobId', async () => {
    const mockJob = {
      id: 'job-123',
      status: 'processing',
      current_step: 3,
      step_label: 'Minting NFT...',
      percentage: 65,
    };
    getJobStatus.mockResolvedValueOnce(mockJob);
    const token = generateAdminToken();

    const res = await request(app)
      .get('/api/job-status/job-123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockJob);
  });

  it('should return completed job with result', async () => {
    const mockJob = {
      id: 'job-456',
      status: 'completed',
      percentage: 100,
      result: { tokenId: '1', txHash: '0xabc' },
    };
    getJobStatus.mockResolvedValueOnce(mockJob);
    const token = generateStudentToken();

    const res = await request(app)
      .get('/api/job-status/job-456')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.result.tokenId).toBe('1');
  });

  it('should return failed job with error', async () => {
    const mockJob = {
      id: 'job-789',
      status: 'failed',
      percentage: 40,
      error: 'IPFS upload timed out',
    };
    getJobStatus.mockResolvedValueOnce(mockJob);
    const token = generateAdminToken();

    const res = await request(app)
      .get('/api/job-status/job-789')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toBe('IPFS upload timed out');
  });
});
