/**
 * Unit Tests — Validators Middleware (Zod schemas)
 */
const { validateRegister, validateLogin, validateWallet, validateNftIssue, schemas } = require('../../../middleware/validators');

describe('Validators Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('validateRegister', () => {
    it('should pass valid registration data', () => {
      req = {
        body: {
          email: 'test@example.com',
          password: 'password123',
          full_name: 'Test User',
          student_id_number: '25TYBSCIT001',
          course_name: 'BSCIT',
          year: 'TY',
        },
      };

      validateRegister(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.email).toBe('test@example.com');
    });

    it('should reject missing email', () => {
      req = {
        body: { password: 'pass123', full_name: 'Test', student_id_number: 'X', course_name: 'Y', year: 'Z' },
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation failed' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid email format', () => {
      req = {
        body: {
          email: 'not-an-email',
          password: 'password123',
          full_name: 'Test User',
          student_id_number: 'X',
          course_name: 'Y',
          year: 'Z',
        },
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject password shorter than 6 characters', () => {
      req = {
        body: {
          email: 'test@example.com',
          password: '12345',
          full_name: 'Test User',
          student_id_number: 'X',
          course_name: 'Y',
          year: 'Z',
        },
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateLogin', () => {
    it('should pass valid login data', () => {
      req = { body: { email: 'test@example.com', password: 'password123' } };

      validateLogin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject empty password', () => {
      req = { body: { email: 'test@example.com', password: '' } };

      validateLogin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateWallet', () => {
    it('should pass valid wallet password', () => {
      req = { body: { password: 'wallet123' } };

      validateWallet(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject wallet password shorter than 6 chars', () => {
      req = { body: { password: '123' } };

      validateWallet(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateNftIssue', () => {
    it('should pass valid NFT issuance data', () => {
      req = { body: { recipientId: '1', title: 'Award Certificate' } };

      validateNftIssue(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject missing recipientId', () => {
      req = { body: { title: 'Award Certificate' } };

      validateNftIssue(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject missing title', () => {
      req = { body: { recipientId: '1' } };

      validateNftIssue(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
