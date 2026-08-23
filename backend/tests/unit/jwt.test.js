import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// JWT_SECRET must exist before jwt.js is imported, since it's read at
// sign/verify call time via process.env.
before(() => {
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
});

const { signToken, verifyToken } = await import('../../src/utils/jwt.js');

test('signToken then verifyToken round-trips the user id and email', () => {
  const token = signToken({ id: 'user-123', email: 'adarsh@example.com' });
  const payload = verifyToken(token);
  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.email, 'adarsh@example.com');
});

test('verifyToken throws on a garbage token', () => {
  assert.throws(() => verifyToken('not-a-real-token'));
});
