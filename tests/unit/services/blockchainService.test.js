/**
 * Unit Tests — Blockchain Service
 * Tests with mocked ethers.js contract interactions
 */

// We mock the entire ethers module and the contract interactions
jest.mock('ethers', () => {
  const mockContract = {
    safeMint: jest.fn(),
    revoke: jest.fn(),
    reinstate: jest.fn(),
    isRevoked: jest.fn(),
    ownerOf: jest.fn(),
    tokenURI: jest.fn(),
    getAddress: jest.fn().mockResolvedValue('0xContractAddress'),
  };

  const mockProvider = {
    getBalance: jest.fn().mockResolvedValue(BigInt('10000000000000000000')),
    getFeeData: jest.fn().mockResolvedValue({
      gasPrice: BigInt('20000000000'),
    }),
    getNetwork: jest.fn().mockResolvedValue({ name: 'localhost', chainId: 31337 }),
  };

  const mockWallet = {
    address: '0xAdminWalletAddress',
    connect: jest.fn().mockReturnThis(),
  };

  return {
    JsonRpcProvider: jest.fn().mockReturnValue(mockProvider),
    Wallet: jest.fn().mockReturnValue(mockWallet),
    Contract: jest.fn().mockReturnValue(mockContract),
    formatEther: jest.fn((val) => (Number(val) / 1e18).toString()),
    parseEther: jest.fn((val) => BigInt(val * 1e18)),
    _mockContract: mockContract,
    _mockProvider: mockProvider,
  };
});

// Must mock before importing
jest.mock('../../../db', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
}));

const ethers = require('ethers');

describe('Blockchain Service', () => {
  let blockchainService;
  let mockContract;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContract = ethers._mockContract;
    // Re-require to get fresh module
    jest.isolateModules(() => {
      blockchainService = require('../../../services/blockchainService');
    });
  });

  describe('mintNFT', () => {
    it('should call safeMint and return tokenId and txHash', async () => {
      const mockTx = {
        hash: '0xmocktxhash123',
        wait: jest.fn().mockResolvedValue({
          logs: [{ args: [null, null, BigInt(42)] }],
        }),
      };
      mockContract.safeMint.mockResolvedValue(mockTx);

      const result = await blockchainService.mintNFT(
        '0xRecipientAddress',
        'ipfs://QmTestCID'
      );

      expect(mockContract.safeMint).toHaveBeenCalledWith(
        '0xRecipientAddress',
        'ipfs://QmTestCID'
      );
      expect(result).toHaveProperty('transactionHash', '0xmocktxhash123');
      expect(result).toHaveProperty('tokenId');
    });

    it('should throw when safeMint reverts', async () => {
      mockContract.safeMint.mockRejectedValue(new Error('Transaction reverted'));

      await expect(
        blockchainService.mintNFT('0xAddr', 'ipfs://x')
      ).rejects.toThrow('Transaction reverted');
    });
  });

  describe('revokeNFT', () => {
    it('should call revoke on the contract', async () => {
      const mockTx = {
        hash: '0xrevokehash',
        wait: jest.fn().mockResolvedValue({}),
      };
      mockContract.revoke.mockResolvedValue(mockTx);

      const result = await blockchainService.revokeNFT(1);

      expect(mockContract.revoke).toHaveBeenCalledWith(1);
      expect(result.transactionHash).toBe('0xrevokehash');
    });
  });

  describe('reinstateNFT', () => {
    it('should call reinstate on the contract', async () => {
      const mockTx = {
        hash: '0xreinstatehash',
        wait: jest.fn().mockResolvedValue({}),
      };
      mockContract.reinstate.mockResolvedValue(mockTx);

      const result = await blockchainService.reinstateNFT(1);

      expect(mockContract.reinstate).toHaveBeenCalledWith(1);
      expect(result.transactionHash).toBe('0xreinstatehash');
    });
  });

  describe('verifyCertificate', () => {
    it('should return valid: true for existing non-revoked token', async () => {
      mockContract.ownerOf.mockResolvedValue('0xOwnerAddress');
      mockContract.tokenURI.mockResolvedValue('ipfs://QmTest');
      mockContract.isRevoked.mockResolvedValue(false);

      const result = await blockchainService.verifyCertificate(1);

      expect(result.valid).toBe(true);
      expect(result.revoked).toBe(false);
      expect(result.owner).toBe('0xOwnerAddress');
      expect(result.tokenURI).toBe('ipfs://QmTest');
    });

    it('should return valid: false for non-existent token', async () => {
      mockContract.ownerOf.mockRejectedValue(new Error('ERC721: invalid token ID'));

      const result = await blockchainService.verifyCertificate(99999);

      expect(result.valid).toBe(false);
    });
  });
});
