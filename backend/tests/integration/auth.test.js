import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pool from '../../src/config/db.js';
import authRoutes from '../../src/routes/authRoutes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

let server;
let baseUrl;

const TEST_EMAIL_1 = 'integration_test_user_1@example.com';
const TEST_EMAIL_2 = 'integration_test_user_2@example.com';
const TEST_PASSWORD = 'Password123!';
const TEST_DISPLAY_NAME = 'Test User One';

// 9.9.9 QA fix #3: email case-insensitivity regression coverage.
const CASE_TEST_EMAIL_MIXED = 'CaseTest_User@Example.COM';
const CASE_TEST_EMAIL_LOWER = 'casetest_user@example.com';

async function cleanupTestUsers() {
  await pool.query('DELETE FROM users WHERE email IN ($1, $2, $3)', [
    TEST_EMAIL_1,
    TEST_EMAIL_2,
    CASE_TEST_EMAIL_LOWER,
  ]);
}

before(async () => {
  // Ensure clean state before running tests
  await cleanupTestUsers();

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', async (req, res) => {
    try {
      const result = await pool.query('SELECT now()');
      res.json({ status: 'ok', dbTime: result.rows[0].now });
    } catch (err) {
      console.error('Health check DB query failed:', err.message);
      res.status(500).json({ status: 'error', message: 'Database connection failed' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use(errorHandler);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await cleanupTestUsers();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

test('GET /api/health returns 200 and status ok', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.ok(data.dbTime);
});

let authToken;
let createdUserId;

test('POST /api/auth/register creates a new user and returns JWT token', async () => {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL_1,
      password: TEST_PASSWORD,
      displayName: TEST_DISPLAY_NAME,
    }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.ok(data.token);
  assert.ok(data.user);
  assert.equal(data.user.email, TEST_EMAIL_1);
  assert.equal(data.user.display_name, TEST_DISPLAY_NAME);
  assert.equal(data.user.password_hash, undefined, 'password_hash should never be exposed');

  authToken = data.token;
  createdUserId = data.user.id;
});

test('POST /api/auth/register fails on duplicate email with 409 EMAIL_TAKEN', async () => {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL_1,
      password: TEST_PASSWORD,
      displayName: 'Duplicate User',
    }),
  });

  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.error.code, 'EMAIL_TAKEN');
});

test('POST /api/auth/register fails on invalid input with 422 VALIDATION_ERROR', async () => {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'not-an-email',
      password: 'short',
      displayName: '',
    }),
  });

  assert.equal(res.status, 422);
  const data = await res.json();
  assert.equal(data.error.code, 'VALIDATION_ERROR');
});

test('POST /api/auth/login authenticates registered user and returns JWT', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL_1,
      password: TEST_PASSWORD,
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.token);
  assert.equal(data.user.email, TEST_EMAIL_1);
});

test('POST /api/auth/login fails on wrong password with 401 INVALID_CREDENTIALS', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL_1,
      password: 'WrongPassword123!',
    }),
  });

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error.code, 'INVALID_CREDENTIALS');
});

test('POST /api/auth/login fails on non-existent email with 401 INVALID_CREDENTIALS', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'nobody_exists_here@example.com',
      password: TEST_PASSWORD,
    }),
  });

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error.code, 'INVALID_CREDENTIALS');
});

// 9.9.9 QA fix #3: registering with a mixed-case email must store (and
// always report back) the lowercased form - the backend is the source
// of truth for normalization, not a frontend convention.
test('POST /api/auth/register normalizes a mixed-case email to lowercase', async () => {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: CASE_TEST_EMAIL_MIXED,
      password: TEST_PASSWORD,
      displayName: 'Case Test User',
    }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.user.email, CASE_TEST_EMAIL_LOWER);
});

// A second registration using a *different* case variant of the same
// address must be rejected as a duplicate - proving duplicate detection
// is case-insensitive, not just storage.
test('POST /api/auth/register rejects a differently-cased duplicate of an existing email', async () => {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'CASETEST_USER@EXAMPLE.COM',
      password: TEST_PASSWORD,
      displayName: 'Case Test User Again',
    }),
  });

  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.error.code, 'EMAIL_TAKEN');
});

// Logging in with yet another case variant of an already-registered
// email must succeed - proving login lookup is case-insensitive too,
// not just registration.
test('POST /api/auth/login authenticates using a differently-cased email', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'CaseTest_User@example.com',
      password: TEST_PASSWORD,
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.user.email, CASE_TEST_EMAIL_LOWER);
});

test('GET /api/auth/me returns profile for authenticated user', async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.user.id, createdUserId);
  assert.equal(data.user.email, TEST_EMAIL_1);
});

test('GET /api/auth/me rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error.code, 'UNAUTHENTICATED');
});

test('GET /api/auth/me rejects invalid token with 401 UNAUTHENTICATED', async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: 'Bearer invalid.token.here' },
  });

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error.code, 'UNAUTHENTICATED');
});

test('PATCH /api/auth/me updates display_name and avatar_url', async () => {
  const newName = 'Updated Display Name';
  const newAvatar = 'https://example.com/avatar.jpg';

  const res = await fetch(`${baseUrl}/api/auth/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      displayName: newName,
      avatarUrl: newAvatar,
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.user.display_name, newName);
  assert.equal(data.user.avatar_url, newAvatar);
});

test('POST /api/auth/google with invalid token handles error cleanly without breaking auth', async () => {
  const res = await fetch(`${baseUrl}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: 'invalid_dummy_google_id_token' }),
  });

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error.code, 'INVALID_GOOGLE_TOKEN');
});
