/**
 * Middleware Tests
 * Tests for authentication and CSRF protection middleware
 */

const jwt = require('jsonwebtoken');

// Mock jwt
jest.mock('jsonwebtoken');

const { authenticateToken } = require('../middleware/authMiddleware');

describe('Auth Middleware', () => {

  let mockReq;
  let mockRes;
  let nextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  // ============================================
  // TOKEN AUTHENTICATION
  // ============================================

  describe('authenticateToken', () => {

    test('should reject request without Authorization header', () => {
      authenticateToken(mockReq, mockRes, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access denied. No token provided.' });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    test('should reject invalid token format', () => {
      mockReq.headers.authorization = 'InvalidFormat token123';

      authenticateToken(mockReq, mockRes, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    test('should reject expired token', () => {
      mockReq.headers.authorization = 'Bearer expired-token';
      jwt.verify.mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      });

      authenticateToken(mockReq, mockRes, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('expired')
      }));
    });

    test('should accept valid token and attach user to request', () => {
      mockReq.headers.authorization = 'Bearer valid-token';
      const decodedPayload = { id: 1, email: 'test@example.com' };
      jwt.verify.mockReturnValue(decodedPayload);

      authenticateToken(mockReq, mockRes, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockReq.user).toEqual(decodedPayload);
    });

    test('should handle malformed token', () => {
      mockReq.headers.authorization = 'Bearer malformed-token';
      jwt.verify.mockImplementation(() => {
        throw new jwt.JsonWebTokenError('jwt malformed');
      });

      authenticateToken(mockReq, mockRes, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token.' });
    });

  });

});

describe('CSRF Protection', () => {

  // Import the CSRF middleware
  const { csrfProtection } = require('../middleware/csrfProtection');

  let mockReq;
  let mockRes;
  let nextFunction;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      cookies: {},
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn()
    };
    nextFunction = jest.fn();
  });

  test('should allow GET requests without token', () => {
    mockReq.method = 'GET';
    
    csrfProtection(mockReq, mockRes, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });

  test('should skip CSRF for Bearer token authenticated requests', () => {
    mockReq.method = 'POST';
    mockReq.headers.authorization = 'Bearer some-jwt-token';
    
    csrfProtection(mockReq, mockRes, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });

  test('should generate CSRF token when cookie missing', () => {
    mockReq.method = 'GET';
    mockReq.cookies = {};
    
    csrfProtection(mockReq, mockRes, nextFunction);

    // Should set a cookie with CSRF token
    expect(nextFunction).toHaveBeenCalled();
  });

  test('should reject POST without CSRF token', () => {
    mockReq.method = 'POST';
    mockReq.cookies = { 'csrf-token': 'cookie-token' };
    mockReq.headers = {}; // No X-CSRF-Token header
    
    csrfProtection(mockReq, mockRes, nextFunction);

    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  test('should reject POST with mismatched CSRF token', () => {
    mockReq.method = 'POST';
    mockReq.cookies = { 'csrf-token': 'cookie-token' };
    mockReq.headers = { 'x-csrf-token': 'different-token' };
    
    csrfProtection(mockReq, mockRes, nextFunction);

    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  test('should allow POST with matching CSRF token', () => {
    mockReq.method = 'POST';
    mockReq.cookies = { 'csrf-token': 'matching-token' };
    mockReq.headers = { 'x-csrf-token': 'matching-token' };
    
    csrfProtection(mockReq, mockRes, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });

});
