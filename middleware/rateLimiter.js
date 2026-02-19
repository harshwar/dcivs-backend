/**
 * Rate Limiting Middleware
 * Prevents brute force attacks and API abuse
 */
const rateLimit = require('express-rate-limit');

// Strict limiter for authentication endpoints
// 5 attempts per 15 minutes per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window
    message: {
        error: 'Too many authentication attempts. Please try again after 15 minutes.'
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
});

// General API limiter
// 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: {
        error: 'Too many requests. Please slow down.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict limiter for NFT minting (expensive operation)
// 5 mints per hour per IP
const mintLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 mints per hour
    message: {
        error: 'Minting limit reached. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});


// (exports at bottom of file after lockout functions)
// ──────────────────────────────────────────────────────────
// Account-Based Login Lockout (per email, in-memory)
// ──────────────────────────────────────────────────────────

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Map<email, { attempts, lockedUntil, lastAttempt }>
const loginAttempts = new Map();

/**
 * Check if an email is currently locked out.
 * @returns {{ locked: boolean, remainingMs: number, attempts: number }}
 */
function checkLockout(email) {
  const record = loginAttempts.get(email.toLowerCase());
  if (!record) return { locked: false, remainingMs: 0, attempts: 0 };

  if (record.lockedUntil) {
    const remaining = record.lockedUntil - Date.now();
    if (remaining > 0) {
      return { locked: true, remainingMs: remaining, attempts: record.attempts };
    }
    // Expired — reset
    loginAttempts.delete(email.toLowerCase());
    return { locked: false, remainingMs: 0, attempts: 0 };
  }

  return { locked: false, remainingMs: 0, attempts: record.attempts };
}

/**
 * Record a failed login attempt. Locks if threshold reached.
 * @returns {{ locked: boolean, attemptsRemaining: number, lockoutMinutes: number }}
 */
function recordFailedAttempt(email) {
  const key = email.toLowerCase();
  let record = loginAttempts.get(key);

  if (!record) {
    record = { attempts: 0, lockedUntil: null, lastAttempt: Date.now() };
    loginAttempts.set(key, record);
  }

  record.attempts += 1;
  record.lastAttempt = Date.now();

  if (record.attempts >= LOCKOUT_MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    return { locked: true, attemptsRemaining: 0, lockoutMinutes: Math.ceil(LOCKOUT_DURATION_MS / 60000) };
  }

  return { locked: false, attemptsRemaining: LOCKOUT_MAX_ATTEMPTS - record.attempts, lockoutMinutes: 0 };
}

/**
 * Reset attempts on successful login.
 */
function resetAttempts(email) {
  loginAttempts.delete(email.toLowerCase());
}

// Cleanup stale entries every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [email, record] of loginAttempts) {
    if (now - record.lastAttempt > 60 * 60 * 1000) loginAttempts.delete(email);
  }
}, 30 * 60 * 1000);

module.exports = { authLimiter, apiLimiter, mintLimiter, checkLockout, recordFailedAttempt, resetAttempts };
