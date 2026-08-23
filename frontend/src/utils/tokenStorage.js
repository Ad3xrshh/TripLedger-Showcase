/**
 * Wraps localStorage access for the JWT so the storage key/mechanism is
 * defined in exactly one place. Swapping to a different storage strategy
 * later only means changing this file.
 */
const TOKEN_KEY = 'triply_auth_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}
