import './TripLedgerMark.css';

/**
 * The torn-ticket "T" glyph from the official TripLedger logo, plus a
 * teal bar picking up the same accent as the wordmark's "Ledger". Fills
 * are set by CSS class (see TripLedgerMark.css) rather than hardcoded so
 * this same markup can be recolored per surface (light Topbar/AuthLayout
 * vs the dark Sidebar rail) without branching the SVG itself. Always
 * decorative: the accessible name for "back to My Trips" comes from the
 * wrapping <Link aria-label> in Topbar.jsx, or from the sighted-only
 * context it sits in elsewhere.
 */
function MarkIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 90"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="trip-ledger-mark__glyph" x="34" y="6" width="18" height="78" />
      <rect className="trip-ledger-mark__glyph" x="34" y="64" width="48" height="14" />
      <rect className="trip-ledger-mark__glyph" x="58" y="26" width="34" height="7" />
      <rect className="trip-ledger-mark__glyph" x="58" y="38" width="26" height="7" />
      <rect className="trip-ledger-mark__glyph" x="58" y="50" width="30" height="7" />
      <rect className="trip-ledger-mark__bar" x="12" y="4" width="76" height="18" rx="9" />
    </svg>
  );
}

/**
 * The official TripLedger brand mark: the glyph above plus the two-tone
 * "Trip"/"Ledger" wordmark. This is the light-surface version, tuned to
 * read on --color-paper/--color-paper-raised (Topbar, AuthLayout). The
 * landing page's own header (pages/LandingPage.jsx) draws the same shapes
 * with light-on-dark fills for its full-bleed navy hero instead of
 * reusing this component, since that page has to keep working
 * unauthenticated and outside the app shell entirely.
 *
 * size: 'md' (default - Topbar) | 'lg' (AuthLayout panel)
 * iconOnly: renders just the glyph, no wordmark - for decorative
 *   branding (the Sidebar rail) where the Topbar link already provides
 *   the "back to My Trips" affordance, so a second wordmark/link would
 *   be redundant. Always paired with aria-hidden on the caller's side.
 */
export function TripLedgerMark({ size = 'md', iconOnly = false }) {
  if (iconOnly) {
    return <MarkIcon className="trip-ledger-mark__icon trip-ledger-mark__icon--standalone" />;
  }

  return (
    <span className={`trip-ledger-mark trip-ledger-mark--${size}`}>
      <MarkIcon className="trip-ledger-mark__icon" />
      <span className="trip-ledger-mark__word">
        <span className="trip-ledger-mark__trip">Trip</span>
        <span className="trip-ledger-mark__ledger">Ledger</span>
      </span>
    </span>
  );
}
