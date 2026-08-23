import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, comparePassword } from '../../src/utils/password.js';

test('hashPassword produces a hash different from the plaintext', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.notEqual(hash, 'correct horse battery staple');
  assert.ok(hash.startsWith('$2b$'), 'expected a bcrypt hash');
});

test('comparePassword returns true for the correct password', async () => {
  const hash = await hashPassword('my-secret-password');
  const result = await comparePassword('my-secret-password', hash);
  assert.equal(result, true);
});

test('comparePassword returns false for the wrong password', async () => {
  const hash = await hashPassword('my-secret-password');
  const result = await comparePassword('totally-wrong', hash);
  assert.equal(result, false);
});

test('comparePassword returns false (not throws) when hash is null', async () => {
  // Covers the case of a Google-only account with no password_hash.
  const result = await comparePassword('anything', null);
  assert.equal(result, false);
});
