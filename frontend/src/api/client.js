import axios from 'axios';
import { getToken, clearToken } from '../utils/tokenStorage.js';

/**
 * Central API client for the TripLedger Phase 8 backend.
 *
 * Base URL and error shape are taken directly from the inspected backend:
 *   - routes are mounted under /api (src/index.js)
 *   - errors are always { error: { code, message } } (errorHandler.js)
 *   - authenticated requests use "Authorization: Bearer <token>" (requireAuth.js)
 *
 * This file owns HTTP plumbing only. It does not know about trips,
 * expenses, or any other domain concept - that logic stays on the backend.
 */

// Vite exposes only variables prefixed with VITE_ to client code.
// Falls back to the backend's documented default port (4000) for local dev.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the stored JWT to every outgoing request, if present.
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Normalizes backend errors into a single shape the UI can rely on:
 *   { status, code, message }
 * The backend's errorHandler.js always responds with
 * { error: { code, message } } on failure, so we unwrap that here once
 * instead of repeating it at every call site.
 */
function normalizeError(error) {
  if (error.response) {
    const { status, data } = error.response;
    return {
      status,
      code: data?.error?.code || 'UNKNOWN_ERROR',
      message: data?.error?.message || 'Something went wrong.',
    };
  }
  if (error.request) {
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: "Trip Ledger couldn't reach the server. Check your connection and try again.",
    };
  }
  return {
    status: 0,
    code: 'CLIENT_ERROR',
    message: error.message || 'Something went wrong.',
  };
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized = normalizeError(error);

    // A 401 from an authenticated call means the token is missing/expired/
    // invalid (see requireAuth.js). Clear it so the app doesn't keep
    // sending a dead token; the auth context reacts to this by logging out.
    if (normalized.status === 401) {
      clearToken();
    }

    return Promise.reject(normalized);
  }
);

export default apiClient;
