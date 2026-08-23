import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { TripLedgerMark } from '../ui/TripLedgerMark.jsx';
import './AuthLayout.css';

/**
 * Brand-panel copy. Paraphrased from the landing page's own "How Trip
 * Ledger works" steps (pages/LandingPage.jsx) rather than invented fresh,
 * so the promise made here matches what that page already says the
 * product does.
 */
const BRAND_POINTS = [
  "Log what's spent as you go — the fair split updates itself.",
  'Every expense is verified before it counts toward the ledger.',
  'Settle up in a simplified set of payments, not everyone-pays-everyone.',
];

export function AuthLayout() {
  const { status } = useAuth();

  if (status === 'checking') {
    return (
      <div className="auth-checking">
        <p>Checking your session…</p>
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-layout">
      <div className="card card--lg auth-layout__panel">
        {/* Brand side: sets "this is TripLedger" before the form loads.
            Purely supplementary to the task (logging in/registering), so
            it isn't the page's <h1> - LoginPage/RegisterPage's own
            "Log in" / "Create your account" heading remains that. */}
        <div className="auth-layout__brand">
          <TripLedgerMark size="lg" />
          <p className="auth-layout__tagline">Split trips. Settle fair. No spreadsheets.</p>
          <ul className="auth-layout__points">
            {BRAND_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <div className="auth-layout__form">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
