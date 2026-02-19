/**
 * Passkey (WebAuthn) Routes
 * Handles passkey registration, authentication, listing, and deletion.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  registerOptions,
  registerVerify,
  loginOptions,
  loginVerify,
  listPasskeys,
  deletePasskey,
} = require('../controllers/passkeyController');

// --- Registration (Authenticated) ---
router.post('/register-options', authenticateToken, registerOptions);
router.post('/register-verify', authenticateToken, registerVerify);

// --- Authentication / Login (Public, rate-limited) ---
router.post('/login-options', authLimiter, loginOptions);
router.post('/login-verify', authLimiter, loginVerify);

// --- Management (Authenticated) ---
router.get('/list', authenticateToken, listPasskeys);
router.delete('/:credentialId', authenticateToken, deletePasskey);

module.exports = router;
