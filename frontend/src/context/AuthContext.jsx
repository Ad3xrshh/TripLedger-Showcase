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
        setUser(fetchedUser);
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
    setUser(loggedInUser);
    setStatus('authenticated');
    return loggedInUser;
  }, []);

  const register = useCallback(async (details) => {
    const { user: newUser, token } = await authApi.register(details);
    setToken(token);
    setUser(newUser);
    setStatus('authenticated');
    return newUser;
  }, []);

  const loginWithGoogle = useCallback(async (idToken) => {
    const { user: loggedInUser, token } = await authApi.loginWithGoogle({ idToken });
    setToken(token);
    setUser(loggedInUser);
    setStatus('authenticated');
    return loggedInUser;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const refreshUser = useCallback(async () => {
    const fetchedUser = await authApi.fetchCurrentUser();
    setUser(fetchedUser);
    return fetchedUser;
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
