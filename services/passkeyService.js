/**
 * Passkey (WebAuthn) Service
 * Wraps @simplewebauthn/server for registration and authentication flows.
 */
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

// Relying Party configuration
const RP_NAME = process.env.RP_NAME || 'University NFT Certificate System';
const RP_ID = process.env.RP_ID || 'localhost';

// ALLOWED ORIGINS (Support multiple ports for dev)
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  process.env.RP_ORIGIN
].filter(Boolean);

/**
 * In-memory challenge store with auto-expiry (5 minutes).
 * Key: `reg-${userId}` or `auth-${email}`
 * Value: challenge string
 */
const challengeStore = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function storeChallenge(key, challenge) {
  challengeStore.set(key, challenge);
  setTimeout(() => challengeStore.delete(key), CHALLENGE_TTL_MS);
}

function getAndDeleteChallenge(key) {
  const challenge = challengeStore.get(key);
  challengeStore.delete(key);
  return challenge;
}

/**
 * Generate registration options for a user.
 * @param {Object} user - { id, email, full_name }
 * @param {Array} existingCredentials - Already-registered credential descriptors
 * @returns {Object} PublicKeyCredentialCreationOptions
 */
async function getRegistrationOptions(user, existingCredentials = []) {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(String(user.id)),
    userName: user.email,
    userDisplayName: user.full_name || user.email,
    // Prevent re-registering existing credentials
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.id,
      type: 'public-key',
      transports: cred.transports || [],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    attestationType: 'none',
  });

  // Store challenge for later verification
  storeChallenge(`reg-${user.id}`, options.challenge);

  return options;
}

/**
 * Verify a registration response from the browser.
 * @param {Object} body - The attestation response from startRegistration()
 * @param {number} userId - User ID to look up the stored challenge
 * @param {string} origin - The origin header from the request
 * @returns {Object} { verified, registrationInfo }
 */
async function verifyRegistration(body, userId, origin) {
  const expectedChallenge = getAndDeleteChallenge(`reg-${userId}`);

  if (!expectedChallenge) {
    throw new Error('Challenge expired or not found. Please try again.');
  }

  // Validate Origin
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
     // If strict check fails, allow if it matches RP_ID (localhost) and port is different
     // But strictly, we should use the array.
     console.warn(`Origin warning: Request from ${origin}, expected one of ${ALLOWED_ORIGINS.join(', ')}`);
  }

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: ALLOWED_ORIGINS, // SimpleWebAuthn supports array of origins
    expectedRPID: RP_ID,
  });

  return verification;
}

/**
 * Generate authentication options for a user.
 * @param {string} email - User email (used as challenge store key)
 * @param {Array} credentials - Array of { id, transports } for allowCredentials
 * @returns {Object} PublicKeyCredentialRequestOptions
 */
async function getAuthenticationOptions(email, credentials = []) {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: credentials.map((cred) => ({
      id: cred.id,
      type: 'public-key',
      transports: cred.transports || [],
    })),
    userVerification: 'preferred',
  });

  // Store challenge for later verification
  storeChallenge(`auth-${email}`, options.challenge);

  return options;
}

/**
 * Verify an authentication response from the browser.
 * @param {Object} body - The assertion response from startAuthentication()
 * @param {Object} credential - Stored credential { id, publicKey, counter }
 * @param {string} email - User email to look up the stored challenge
 * @returns {Object} { verified, authenticationInfo }
 */
async function verifyAuthentication(body, credential, email, origin) {
  const expectedChallenge = getAndDeleteChallenge(`auth-${email}`);

  if (!expectedChallenge) {
    throw new Error('Challenge expired or not found. Please try again.');
  }

  // Validate Origin (Optional logging)
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
     console.warn(`Origin warning (Auth): Request from ${origin}, expected one of ${ALLOWED_ORIGINS.join(', ')}`);
  }

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: ALLOWED_ORIGINS, // Array support
    expectedRPID: RP_ID,
    credential: {
      id: credential.id,
      publicKey: credential.public_key,
      counter: credential.counter,
      transports: credential.transports || [],
    },
  });

  return verification;
}

module.exports = {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  RP_ID,
  RP_NAME,
  RP_ORIGIN: ALLOWED_ORIGINS[0],
};
