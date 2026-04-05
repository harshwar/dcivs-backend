/**
 * Unit Tests — Pinata Helpers
 */
jest.mock('axios', () => ({
  post: jest.fn(),
}));

jest.mock('fs', () => ({
  createReadStream: jest.fn().mockReturnValue('mock-stream'),
}));

const axios = require('axios');
const { pinFileToIPFS, pinJSONToIPFS } = require('../../../utils/pinataHelpers');

describe('Pinata Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pinFileToIPFS', () => {
    it('should return IPFS hash on success', async () => {
      axios.post.mockResolvedValueOnce({
        data: { IpfsHash: 'QmTestImageHash' },
      });

      const result = await pinFileToIPFS('/tmp/test.png');

      expect(result).toBe('QmTestImageHash');
      expect(axios.post).toHaveBeenCalled();
    });

    it('should throw on Pinata API failure', async () => {
      axios.post.mockRejectedValueOnce(new Error('Pinata API error'));

      await expect(pinFileToIPFS('/tmp/test.png')).rejects.toThrow('Pinata API error');
    });
  });

  describe('pinJSONToIPFS', () => {
    it('should return IPFS hash for JSON metadata', async () => {
      axios.post.mockResolvedValueOnce({
        data: { IpfsHash: 'QmTestMetadataHash' },
      });

      const metadata = { name: 'Test', description: 'Test document' };
      const result = await pinJSONToIPFS(metadata);

      expect(result).toBe('QmTestMetadataHash');
    });

    it('should throw on API failure', async () => {
      axios.post.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(pinJSONToIPFS({})).rejects.toThrow('Network timeout');
    });
  });
});
