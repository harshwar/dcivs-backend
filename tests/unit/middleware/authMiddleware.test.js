/**
 * Unit Tests — Auth Middleware
 * Tests authenticateToken and requireAdmin middleware functions.
 */
const { authenticateToken, requireAdmin } = require('../../../middleware/authMiddleware');
const {
  generateStudentToken,
  generateAdminToken,
  generateExpiredToken,
  generateInvalidToken,
} = require('../../helpers/authHelper');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  // ─── authenticateToken ──────────────────────────

  describe('authenticateToken', () => {
    it('should call next() and attach req.user for a valid student token', () => {
      const token = generateStudentToken({ id: 1, email: 'student@test.com' });
      req.headers['authorization'] = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(1);
      expect(req.user.email).toBe('student@test.com');
    });

    it('should call next() and attach req.user for a valid admin token', () => {
      const token = generateAdminToken({ id: 100, email: 'admin@test.com' });
      req.headers['authorization'] = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.role).toBe('admin');
    });

    it('should return 401 when no authorization header is present', () => {
      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('token missing') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header has no Bearer prefix', () => {
      req.headers['authorization'] = 'Basic sometoken';

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for an expired token', () => {
      const token = generateExpiredToken({ id: 1 });
      req.headers['authorization'] = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Invalid or expired') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for a token signed with wrong secret', () => {
      const token = generateInvalidToken({ id: 1 });
      req.headers['authorization'] = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for a completely malformed token', () => {
      req.headers['authorization'] = 'Bearer not.a.valid.jwt.token';

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ─── requireAdmin ───────────────────────────────

  describe('requireAdmin', () => {
    it('should call next() for admin role', () => {
      req.user = { id: 100, role: 'admin' };

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should call next() for super_admin role', () => {
      req.user = { id: 101, role: 'super_admin' };

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 403 when user has no role (student)', () => {
      req.user = { id: 1, email: 'student@test.com' };

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Access denied') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when user role is "student"', () => {
      req.user = { id: 1, role: 'student' };

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when req.user is null', () => {
      req.user = null;

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when req.user is undefined', () => {
      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
