/**
 * Unit Tests — Wallet Service
 * Tests createEncryptedWallet and decryptWallet
 */
const { createEncryptedWallet, decryptWallet } = require('../../../services/walletService');

describe('Wallet Service', () => {
  describe('createEncryptedWallet', () => {
    it('should return an object with address and encryptedJson', async () => {
      const result = await createEncryptedWallet('securepass123');

      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('encryptedJson');
      expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof result.encryptedJson).toBe('string');

      // encryptedJson should be parseable JSON
      const parsed = JSON.parse(result.encryptedJson);
      expect(parsed).toHaveProperty('address');
    }, 30000); // ethers wallet creation can be slow

    it('should generate a unique address each time', async () => {
      const w1 = await createEncryptedWallet('pass1');
      const w2 = await createEncryptedWallet('pass2');

      expect(w1.address).not.toBe(w2.address);
    }, 30000);
  });

  describe('decryptWallet', () => {
    it('should recover the wallet from encrypted JSON with correct password', async () => {
      const password = 'test_password_123';
      const { encryptedJson, address } = await createEncryptedWallet(password);

      const wallet = await decryptWallet(encryptedJson, password);

      expect(wallet).toBeDefined();
      expect(wallet.address.toLowerCase()).toBe(address.toLowerCase());
    }, 30000);

    it('should fail with wrong password', async () => {
      const { encryptedJson } = await createEncryptedWallet('correctpass');

      await expect(decryptWallet(encryptedJson, 'wrongpass'))
        .rejects.toThrow();
    }, 30000);
  });
});
