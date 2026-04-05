/**
 * Unit Tests — Rate Limiter (account lockout functions)
 */
const { checkLockout, recordFailedAttempt, resetAttempts } = require('../../../middleware/rateLimiter');

describe('Rate Limiter — Account Lockout', () => {
  const testEmail = 'lockout-test@test.com';

  afterEach(() => {
    // Reset state between tests
    resetAttempts(testEmail);
    resetAttempts('other@test.com');
  });

  describe('checkLockout', () => {
    it('should return locked: false for an unknown email', () => {
      const result = checkLockout('unknown@test.com');
      expect(result.locked).toBe(false);
      expect(result.attempts).toBe(0);
    });

    it('should return locked: false after fewer than 5 failed attempts', () => {
      recordFailedAttempt(testEmail);
      recordFailedAttempt(testEmail);

      const result = checkLockout(testEmail);
      expect(result.locked).toBe(false);
      expect(result.attempts).toBe(2);
    });
  });

  describe('recordFailedAttempt', () => {
    it('should increment attempt count', () => {
      const r1 = recordFailedAttempt(testEmail);
      expect(r1.locked).toBe(false);
      expect(r1.attemptsRemaining).toBe(4);

      const r2 = recordFailedAttempt(testEmail);
      expect(r2.attemptsRemaining).toBe(3);
    });

    it('should lock account after 5 failed attempts', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt(testEmail);
      }
      const result = recordFailedAttempt(testEmail);

      expect(result.locked).toBe(true);
      expect(result.attemptsRemaining).toBe(0);
      expect(result.lockoutMinutes).toBeGreaterThan(0);
    });

    it('should reflect locked state via checkLockout after lockout', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(testEmail);
      }

      const status = checkLockout(testEmail);
      expect(status.locked).toBe(true);
      expect(status.remainingMs).toBeGreaterThan(0);
    });
  });

  describe('resetAttempts', () => {
    it('should clear failed attempts for an email', () => {
      recordFailedAttempt(testEmail);
      recordFailedAttempt(testEmail);

      resetAttempts(testEmail);

      const result = checkLockout(testEmail);
      expect(result.locked).toBe(false);
      expect(result.attempts).toBe(0);
    });

    it('should unlock a locked account', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(testEmail);
      }
      expect(checkLockout(testEmail).locked).toBe(true);

      resetAttempts(testEmail);
      expect(checkLockout(testEmail).locked).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('should treat emails case-insensitively', () => {
      recordFailedAttempt('User@Test.com');

      const result = checkLockout('user@test.com');
      expect(result.attempts).toBe(1);
    });
  });
});
