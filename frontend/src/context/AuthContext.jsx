import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth.js';
import { getToken, setToken, clearToken } from '../utils/tokenStorage.js';

/**
 * AuthContext holds the app's JWT authentication state:
 *   - user: the current user object from the backend, or null
 *   - status: 'checking' | 'authenticated' | 'unauthenticated'
 *   - login / register / loginWithGoogle / logout / refreshUser
 *
 * The token itself lives in localStorage (see utils/tokenStorage.js) and
 * is attached to requests by the API client's interceptor - components
 * never touch the raw token directly.
 */
export const AuthContext = createContext(undefined);

function normalizeUser(userObj) {
  if (!userObj) return null;
  const displayName = userObj.displayName || userObj.display_name || '';
  return {
    ...userObj,
    displayName,
    display_name: displayName,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('checking');

  // On first load, if a token is already stored, verify it against
  // GET /api/auth/me rather than trusting it blindly.
  useEffect(() => {
    const existingToken = getToken();
    if (!existingToken) {
      setStatus('unauthenticated');
      return;
    }

    authApi
      .fetchCurrentUser()
      .then((fetchedUser) => {
        setUser(normalizeUser(fetchedUser));
        setStatus('authenticated');
      })
      .catch(() => {
        clearToken();
        setUser(null);
        setStatus('unauthenticated');
      });
  }, []);

  const login = useCallback(async (credentials) => {
    const { user: loggedInUser, token } = await authApi.login(credentials);
    setToken(token);
    const normalized = normalizeUser(loggedInUser);
    setUser(normalized);
    setStatus('authenticated');
    return normalized;
  }, []);

  const register = useCallback(async (details) => {
    const { user: newUser, token } = await authApi.register(details);
    setToken(token);
    const normalized = normalizeUser(newUser);
    setUser(normalized);
    setStatus('authenticated');
    return normalized;
  }, []);

  const loginWithGoogle = useCallback(async (idToken) => {
    const { user: loggedInUser, token } = await authApi.loginWithGoogle({ idToken });
    setToken(token);
    const normalized = normalizeUser(loggedInUser);
    setUser(normalized);
    setStatus('authenticated');
    return normalized;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const refreshUser = useCallback(async () => {
    const fetchedUser = await authApi.fetchCurrentUser();
    const normalized = normalizeUser(fetchedUser);
    setUser(normalized);
    return normalized;
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      register,
      loginWithGoogle,
      logout,
      refreshUser,
    }),
    [user, status, login, register, loginWithGoogle, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
