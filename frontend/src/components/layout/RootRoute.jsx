import { useAuth } from '../../hooks/useAuth.js';
import { AppShell } from './AppShell.jsx';
import { HomePage } from '../../pages/HomePage.jsx';
import { LandingPage } from '../../pages/LandingPage.jsx';

/**
 * Registered at `/` in app/router.jsx, outside both the AuthLayout
 * branch and the RequireAuth+AppShell branch - this is the one route
 * that has to render different things at the exact same URL depending
 * on auth state:
 *   - still checking the stored token -> the same "Checking your
 *     session..." treatment RequireAuth already uses (identical
 *     className, so it's indistinguishable from the one every other
 *     protected route already shows - no second loading UI to design or
 *     maintain).
 *   - authenticated -> My Trips, via AppShell rendered directly (see
 *     AppShell's `children` prop) so it gets the exact same shell every
 *     other authenticated page uses.
 *   - not authenticated -> the public LandingPage, full-bleed with no
 *     app chrome.
 */
export function RootRoute() {
  const { status } = useAuth();

  if (status === 'checking') {
    return (
      <div className="auth-checking">
        <p>Checking your session…</p>
      </div>
    );
  }

  if (status === 'authenticated') {
    return (
      <AppShell>
        <HomePage />
      </AppShell>
    );
  }

  return <LandingPage />;
}
