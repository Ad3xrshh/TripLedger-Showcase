import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateJoinCode } from '../../src/utils/joinCode.js';

test('generateJoinCode returns a 7-character code', () => {
  const code = generateJoinCode();
  assert.equal(code.length, 7);
});

test('generateJoinCode never includes ambiguous characters (0, O, 1, I, L)', () => {
  const ambiguous = /[0OIL1]/;
  for (let i = 0; i < 200; i++) {
    const code = generateJoinCode();
    assert.ok(!ambiguous.test(code), `code "${code}" contained an ambiguous character`);
  }
});

test('generateJoinCode only uses uppercase alphanumeric characters', () => {
  const validChars = /^[A-Z2-9]+$/;
  const code = generateJoinCode();
  assert.ok(validChars.test(code), `code "${code}" contained an unexpected character`);
});

test('generateJoinCode produces varied output across calls', () => {
  const codes = new Set();
  for (let i = 0; i < 50; i++) {
    codes.add(generateJoinCode());
  }
  // Not a strict uniqueness guarantee, but 50 calls producing only 1-2
  // distinct values would indicate a broken RNG usage.
  assert.ok(codes.size > 40, `expected high variety, got ${codes.size} distinct codes out of 50`);
});
