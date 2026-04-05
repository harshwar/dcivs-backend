/**
 * Unit Tests — Job Service
 * Tests createJob, updateJobStep, completeJob, failJob, getJobStatus
 */

// Mock Supabase before requiring the service
const { createMockSupabase } = require('../../helpers/mockSupabase');
const { mockClient, setTableData } = createMockSupabase();
jest.mock('../../../db', () => mockClient);

const { createJob, updateJobStep, completeJob, failJob, getJobStatus } = require('../../../services/jobService');

describe('Job Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    it('should insert a new job and return the job ID', async () => {
      const mockJobId = 'job-uuid-123';
      setTableData('jobs', { id: mockJobId });

      const jobId = await createJob('issue_nft', 5, { title: 'Test' }, 'admin-1');

      expect(mockClient.from).toHaveBeenCalledWith('jobs');
      expect(jobId).toBe(mockJobId);
    });

    it('should set initial status to queued', async () => {
      setTableData('jobs', { id: 'job-uuid-456' });

      await createJob('batch_issue', 3, {}, null);

      const insertCall = mockClient.from('jobs').insert.mock.calls[0][0];
      expect(insertCall[0]).toEqual(
        expect.objectContaining({
          status: 'queued',
          percentage: 0,
          current_step: 0,
        })
      );
    });

    it('should throw when Supabase returns an error', async () => {
      setTableData('jobs', null, { message: 'DB Error' });

      await expect(createJob('test', 1, {}, null)).rejects.toThrow();
    });
  });

  describe('updateJobStep', () => {
    it('should update job with current step, label, and percentage', async () => {
      setTableData('jobs', {});

      await updateJobStep('job-1', 2, 'Pinning to IPFS...', 40);

      const updateCall = mockClient.from('jobs').update.mock.calls[0][0];
      expect(updateCall).toEqual(
        expect.objectContaining({
          current_step: 2,
          step_label: 'Pinning to IPFS...',
          percentage: 40,
          status: 'processing',
        })
      );
    });
  });

  describe('completeJob', () => {
    it('should set status to completed and percentage to 100', async () => {
      setTableData('jobs', {});

      await completeJob('job-1', { tokenId: '1' });

      const updateCall = mockClient.from('jobs').update.mock.calls[0][0];
      expect(updateCall).toEqual(
        expect.objectContaining({
          status: 'completed',
          percentage: 100,
          result: { tokenId: '1' },
        })
      );
    });
  });

  describe('failJob', () => {
    it('should set status to failed with an error message', async () => {
      setTableData('jobs', {});

      await failJob('job-1', 'IPFS upload failed');

      const updateCall = mockClient.from('jobs').update.mock.calls[0][0];
      expect(updateCall).toEqual(
        expect.objectContaining({
          status: 'failed',
          error: 'IPFS upload failed',
        })
      );
    });
  });

  describe('getJobStatus', () => {
    it('should return the job object when found', async () => {
      const mockJob = {
        id: 'job-1',
        status: 'processing',
        current_step: 3,
        step_label: 'Minting...',
        percentage: 65,
      };
      setTableData('jobs', mockJob);

      const result = await getJobStatus('job-1');

      expect(result).toEqual(mockJob);
    });

    it('should return null when job not found', async () => {
      setTableData('jobs', null);

      const result = await getJobStatus('nonexistent');

      expect(result).toBeNull();
    });
  });
});
