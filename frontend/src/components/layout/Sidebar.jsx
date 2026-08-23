import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { HelpModal } from '../help/HelpModal.jsx';
import { ProfileModal } from '../profile/ProfileModal.jsx';
import './Sidebar.css';

/**
 * Primary navigation. Only routes that exist today are linked; the rest
 * of the app (expenses, budget, approvals, settlement, closure) lands in
 * later phases and isn't wired up yet.
 */
const NAV_ITEMS = [{ label: 'My Trips', to: '/', icon: TicketIcon }];

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v1.75a1.75 1.75 0 0 0 0 3.5v1.75A1.5 1.5 0 0 1 18.5 17h-13A1.5 1.5 0 0 1 4 15.5v-1.75a1.75 1.75 0 0 0 0-3.5V8.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 7.5v9" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.5 2" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h6A1.5 1.5 0 0 1 18 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 9 17.5V16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 12H4m0 0 2.5-2.5M4 12l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true" focusable="false">
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

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <aside className="sidebar">
      {/* Pass 2.2: the decorative icon-only TripLedgerMark that used to
          sit here was redundant with the Topbar's full wordmark (see
          Topbar.jsx), which already provides the accessible "back to My
          Trips" brand anchor on every screen size. Removed rather than
          duplicated; .sidebar__nav's own top padding (see Sidebar.css)
          now gives the rail's first section a natural top offset instead
          of leaning on the removed block's spacing. */}
      <nav className="sidebar__nav" aria-label="Primary">
        <p className="eyebrow sidebar__section-label" aria-hidden="true">
          Workspace
        </p>
        <ul className="sidebar__list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end
                className={({ isActive }) =>
                  isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
                }
              >
                <item.icon />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Persistent entry point back into the "How it works" flow (see
          content/howItWorksSteps.jsx) for anyone who signed up straight
          from the landing page's CTA and skipped that section, or just
          wants a refresher without leaving the authenticated app. Circular
          to match the account avatar's shape below it, but never relies on
          the glyph alone - aria-label/title both state its purpose. */}
      <button
        type="button"
        className="sidebar__help"
        onClick={() => setIsHelpOpen(true)}
        aria-label="How TripLedger works"
        title="How TripLedger works"
      >
        <HelpIcon />
      </button>

      {/* Second, decorative-adjacent entry point to the same logout the
          Topbar already exposes (identical useAuth().logout() call) -
          the Topbar's copy remains the one guaranteed to be reachable on
          every viewport, since this rail hides below 720px. */}
      {user && (
        <div className="sidebar__account">
          {/* 9.9.9 QA fix #2: this used to be a plain, non-interactive
              <span> with no click handler at all - the "blue icon with
              no functionality" reported in QA. It's now the entry point
              to a read-only profile view (display name + email, both
              already in AuthContext from GET /api/auth/me) - see
              ProfileModal.jsx. The Help button/HelpModal above are
              untouched. */}
          <button
            type="button"
            className="sidebar__account-avatar"
            onClick={() => setIsProfileOpen(true)}
            aria-label="View your profile"
            title="View your profile"
          >
            {user.displayName?.charAt(0).toUpperCase() || '?'}
          </button>
          <span className="sidebar__account-name">{user.displayName}</span>
          <button
            type="button"
            className="sidebar__account-logout"
            onClick={handleLogout}
            aria-label="Log out"
          >
            <LogoutIcon />
          </button>
        </div>
      )}

      <HelpModal open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <ProfileModal open={isProfileOpen} onClose={() => setIsProfileOpen(false)} user={user} />
    </aside>
  );
}
