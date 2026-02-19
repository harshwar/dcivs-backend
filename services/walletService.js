// backend/services/walletService.js
const { Wallet } = require('ethers');

/**
 * Creates a new random wallet and encrypts it with the given password.
 * Returns { address, encryptedJson }.
 */
async function createEncryptedWallet(password) {
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const wallet = Wallet.createRandom();

  // IMPORTANT: Do NOT log wallet.privateKey.
  const encryptedJson = await wallet.encrypt(password);

  return {
    address: wallet.address,
    encryptedJson,
  };
}

/**
 * Decrypts an encrypted JSON keystore and returns an ethers Wallet instance.
 * NOTE: Prefer decrypting in the frontend for security; this helper is provided
 * for completeness and potential future use on the server.
 */
async function decryptWallet(encryptedJson, password) {
  const wallet = await Wallet.fromEncryptedJson(encryptedJson, password);
  return wallet;
}

module.exports = {
  createEncryptedWallet,
  decryptWallet,
};
