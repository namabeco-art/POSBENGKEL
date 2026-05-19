import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordFailedLogin, getLoginLockoutRemaining, getRemainingAttempts, resetLoginAttempts } from '../services/rateLimiter';

describe('rateLimiter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should allow first login attempt', () => {
    const result = recordFailedLogin();
    expect(result).toBeNull();
  });

  it('should track remaining attempts', () => {
    expect(getRemainingAttempts()).toBe(5);
    recordFailedLogin();
    expect(getRemainingAttempts()).toBe(4);
    recordFailedLogin();
    expect(getRemainingAttempts()).toBe(3);
  });

  it('should lock after 5 failed attempts', () => {
    recordFailedLogin(); // 1
    recordFailedLogin(); // 2
    recordFailedLogin(); // 3
    recordFailedLogin(); // 4
    const lockMsg = recordFailedLogin(); // 5 — should lock
    expect(lockMsg).toContain('terkunci');
    expect(getRemainingAttempts()).toBe(0);
  });

  it('should report lockout remaining time', () => {
    for (let i = 0; i < 5; i++) recordFailedLogin();
    const remaining = getLoginLockoutRemaining();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(300); // 5 minutes max
  });

  it('should reset attempts after successful login', () => {
    recordFailedLogin();
    recordFailedLogin();
    expect(getRemainingAttempts()).toBe(3);
    resetLoginAttempts();
    expect(getRemainingAttempts()).toBe(5);
  });

  it('should not allow login when locked', () => {
    for (let i = 0; i < 5; i++) recordFailedLogin();
    const lockout = getLoginLockoutRemaining();
    expect(lockout).toBeGreaterThan(0);
  });
});
