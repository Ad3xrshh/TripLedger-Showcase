import { Link } from 'react-router-dom';
import { Button } from './Button.jsx';
import './ErrorState.css';

/**
 * Shared "we tried to load this and failed" state - the error counterpart
 * to EmptyState.jsx (styles/structure deliberately mirror it) and distinct
 * from a loading skeleton (styles/skeleton.css). Covers the "component
 * error" and "page-level error" tiers from the 9.9.4 error hierarchy:
 * dashboard cards/panels that self-fetch (Settlement, Trip closure,
 * Approval rules, Expense verification, Notifications, Activity) and
 * whole-page loads (My Trips, Trip detail, Expenses, Expense detail,
 * Members).
 *
 * Used both as a full page-level block (nothing else on the page could
 * render without the failed data) and nested inside an existing .card
 * (compact - no border/padding of its own, matching
 * EmptyState's compact convention, since the parent card already
 * provides that chrome and usually still has its own <h2> title above
 * this).
 *
 * onRetry: pass a function to show a "Retry" button; omit it entirely for
 * errors retrying can't fix (not found, forbidden, a closed trip, a
 * validation problem) - see utils/errorPresentation.js for the shared
 * rule on when a retry is worth offering. This component never decides
 * that on its own; the caller always decides based on the actual error.
 * actions: [{ label, to, variant }] - same shape as EmptyState's actions,
 * for safe navigation (e.g. "Back to my trips") alongside or instead of
 * a retry.
 */
export function ErrorState({
  eyebrow,
  title,
  description,
  compact = false,
  onRetry,
  retryLabel = 'Retry',
  actions = [],
}) {
  const classes = ['error-state', compact && 'error-state--compact'].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {eyebrow && <p className="eyebrow error-state__eyebrow">{eyebrow}</p>}
      {/* Page-level (tier D, 9.9.4's hierarchy) interrupts, since it's
          the only content on the page - role="alert". Compact (tier C,
          a card/panel failing on an otherwise-usable page) is lower
          severity and more than one can appear on screen at once (e.g.
          NotificationsCard and ActivityCard failing together) - a
          polite role="status" avoids stacking assertive interruptions
          for something the user can keep working around. */}
      <p className="error-state__title" role={compact ? 'status' : 'alert'}>
        {title}
      </p>
      {description && <p className="error-state__description">{description}</p>}
      {(onRetry || actions.length > 0) && (
        <div className="error-state__actions">
          {onRetry && (
            <Button variant="secondary" size={compact ? 'sm' : 'md'} onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {actions.map((action) => (
            <Link key={action.label} to={action.to} className={`btn btn--${action.variant || 'secondary'}`}>
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
