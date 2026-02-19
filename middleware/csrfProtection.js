/**
 * CSRF Protection Middleware
 * Implements Double-Submit Cookie pattern for CSRF protection
 * 
 * How it works:
 * 1. Server generates a random token and sets it as a cookie
 * 2. Client must include this token in a custom header (X-CSRF-Token)
 * 3. Server validates that cookie value matches header value
 * 
 * This works because:
 * - Cookies are sent automatically by browsers
 * - But custom headers can only be set by JavaScript on the same origin
 * - CORS prevents other origins from reading cookies or setting custom headers
 */

const crypto = require('crypto');

// Token storage (in production, use Redis or session store)
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

/**
 * Generate a cryptographically secure random token
 */
function generateToken() {
    return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Middleware to set CSRF token cookie on responses
 * Call this on safe routes (GET requests) to issue tokens
 */
function csrfTokenIssuer(req, res, next) {
    // Only issue token if not already present
    if (!req.cookies || !req.cookies[CSRF_COOKIE_NAME]) {
        const token = generateToken();
        res.cookie(CSRF_COOKIE_NAME, token, {
            httpOnly: false, // Must be readable by JavaScript
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            sameSite: 'strict', // Prevent cross-site cookie sending
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
    }
    next();
}

/**
 * Middleware to validate CSRF token on state-changing requests
 * Apply to POST, PUT, DELETE routes
 */
function csrfProtection(req, res, next) {
    // Skip for safe methods (GET, HEAD, OPTIONS)
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
        return next();
    }

    // Skip for API routes using Bearer token authentication
    // Bearer tokens in Authorization headers are immune to CSRF
    // because they're not automatically sent by browsers
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return next();
    }

    // Skip for WebAuthn/Passkey endpoints
    // These use cryptographic challenge-response which is inherently CSRF-safe
    // (the server-generated challenge must be signed by the authenticator device)
    if (req.path.startsWith('/auth/passkey/')) {
        return next();
    }

    // For cookie-based auth (if ever added), validate CSRF token
    const cookieToken = req.cookies ? req.cookies[CSRF_COOKIE_NAME] : null;
    const headerToken = req.headers[CSRF_HEADER_NAME];

    if (!cookieToken || !headerToken) {
        return res.status(403).json({
            error: 'CSRF token missing',
            message: 'Request must include CSRF token in both cookie and header'
        });
    }

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
        return res.status(403).json({
            error: 'CSRF token mismatch',
            message: 'CSRF token validation failed'
        });
    }

    next();
}

/**
 * Endpoint handler to get a new CSRF token
 * Frontend can call GET /api/csrf-token to obtain a token
 */
function getCsrfToken(req, res) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000
    });
    res.json({ csrfToken: token });
}

module.exports = {
    csrfTokenIssuer,
    csrfProtection,
    getCsrfToken,
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME
};
