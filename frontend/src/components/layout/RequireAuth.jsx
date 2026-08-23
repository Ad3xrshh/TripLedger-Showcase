import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';

/**
 * Wraps routes that require a logged-in user. While the initial
 * GET /api/auth/me check is in flight, shows a minimal loading state
 * instead of flashing the login page.
 */
export function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    return (
      <div className="auth-checking">
        <p>Checking your session…</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
