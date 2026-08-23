import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { TripLedgerMark } from '../ui/TripLedgerMark.jsx';
import { Button } from '../ui/Button.jsx';
import { HelpModal } from '../help/HelpModal.jsx';
import './Topbar.css';

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9.6 9.5a2.4 2.4 0 1 1 3.4 2.18c-.66.32-1 .8-1 1.32v.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="16.75" r="1" fill="currentColor" />
    </svg>
  );
}

export function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="topbar">
      {/* The wordmark is the way back to "My Trips" on every screen size -
          this matters most on mobile, where the sidebar nav (currently
          the only other way to reach it) is hidden below 720px. */}
      <Link to="/" className="topbar__mark-link" aria-label="Trip Ledger - My Trips">
        <TripLedgerMark />
      </Link>
      {user && (
        <div className="topbar__user">
          {/* Pass 2.5: the sidebar's "How TripLedger works" entry point
              (see Sidebar.jsx) is unreachable below the 720px breakpoint
              where the sidebar itself hides, so mobile needs its own way
              in. Reuses the exact same HelpModal/content - never a second
              implementation - and is hidden on desktop via Topbar.css
              (min-width: 720px) since the sidebar's button already covers
              that case there. */}
          <button
            type="button"
            className="topbar__help"
            onClick={() => setIsHelpOpen(true)}
            aria-label="How TripLedger works"
            title="How TripLedger works"
          >
            <HelpIcon />
          </button>
          <span className="topbar__user-name">{user.displayName}</span>
          <Button variant="secondary" size="sm" className="topbar__logout" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      )}
      <HelpModal open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </header>
  );
}
