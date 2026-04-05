/**
 * Unit Tests — Error Handler Middleware
 */
const { errorHandler, notFoundHandler } = require('../../../middleware/errorHandler');

describe('Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { method: 'GET', path: '/api/test' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('errorHandler', () => {
    it('should return 500 for errors without statusCode', () => {
      const err = new Error('Something broke');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Something broke' })
      );
    });

    it('should use err.statusCode when available', () => {
      const err = new Error('Not found');
      err.statusCode = 404;

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should use err.status when statusCode is absent', () => {
      const err = new Error('Forbidden');
      err.status = 403;

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should include stack trace in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const err = new Error('Debug error');

      errorHandler(err, req, res, next);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.stack).toBeDefined();
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with route info', () => {
      req.method = 'POST';
      req.path = '/api/nonexistent';

      notFoundHandler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Not Found',
          message: expect.stringContaining('POST /api/nonexistent'),
        })
      );
    });
  });
});
