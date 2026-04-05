/**
 * Auth Helper — JWT generator for tests
 * Creates valid / invalid / expired tokens for testing auth middleware.
 */
const jwt = require('jsonwebtoken');

const TEST_JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

/** Generate a valid student token */
function generateStudentToken(overrides = {}) {
  const payload = {
    id: 1,
    email: 'student@test.com',
    role: undefined, // Students do not have a role field in the default payload
    ...overrides,
  };
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '7d' });
}

/** Generate a valid admin token */
function generateAdminToken(overrides = {}) {
  const payload = {
    id: 100,
    email: 'admin@test.com',
    role: 'admin',
    ...overrides,
  };
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '7d' });
}

/** Generate a valid super_admin token */
function generateSuperAdminToken(overrides = {}) {
  return generateAdminToken({ role: 'super_admin', ...overrides });
}

/** Generate an expired token */
function generateExpiredToken(payload = { id: 1 }) {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '-10s' });
}

/** Generate a token signed with the wrong secret */
function generateInvalidToken(payload = { id: 1 }) {
  return jwt.sign(payload, 'wrong_secret_key', { expiresIn: '7d' });
}

/** A tampered token (manually altered payload) */
function generateTamperedToken() {
  const token = generateStudentToken();
  const parts = token.split('.');
  // Decode payload, modify, re-encode without re-signing
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  payload.role = 'admin'; // escalation attempt
  parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return parts.join('.');
}

module.exports = {
  TEST_JWT_SECRET,
  generateStudentToken,
  generateAdminToken,
  generateSuperAdminToken,
  generateExpiredToken,
  generateInvalidToken,
  generateTamperedToken,
};
