import apiClient from './client.js';

/**
 * Thin wrappers around /api/auth/*, mirroring the backend exactly
 * (see backend/src/routes/authRoutes.js and authController.js).
 * No business logic lives here - only request shaping and response
 * unwrapping.
 */

// POST /api/auth/register  { email, password, displayName } -> { user, token }
export async function register({ email, password, displayName }) {
  const { data } = await apiClient.post('/auth/register', { email, password, displayName });
  return data;
}

// POST /api/auth/login  { email, password } -> { user, token }
export async function login({ email, password }) {
  const { data } = await apiClient.post('/auth/login', { email, password });
  return data;
}

// POST /api/auth/google  { idToken } -> { user, token }
export async function loginWithGoogle({ idToken }) {
  const { data } = await apiClient.post('/auth/google', { idToken });
  return data;
}

// GET /api/auth/me  (requires auth) -> { user }
export async function fetchCurrentUser() {
  const { data } = await apiClient.get('/auth/me');
  return data.user;
}

// PATCH /api/auth/me  { displayName?, avatarUrl? } -> { user }
export async function updateProfile(updates) {
  const { data } = await apiClient.patch('/auth/me', updates);
  return data.user;
}
