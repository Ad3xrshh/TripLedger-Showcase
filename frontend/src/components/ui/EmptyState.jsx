import { Link } from 'react-router-dom';
import { TicketDivider } from './TicketDivider.jsx';
import './EmptyState.css';

/**
 * Shared "there is legitimately no data here" state - distinct from a
 * loading skeleton (styles/skeleton.css) and from an error state. Used
 * both as a full page-level block (dashed border, more breathing room)
 * and nested inside an existing .card (compact - no border/padding of
 * its own, since the parent card already provides that chrome).
 *
 * tone: 'neutral' (default) | 'positive' - positive drops the dashed
 *   border entirely so a "you're all caught up" moment reads as
 *   complete rather than as something missing.
 * compact: true when nesting inside a dashboard card that already has
 *   its own padding/border (see styles/card.css).
 * actions: [{ label, to, variant }] - rendered as real links styled as
 *   buttons (navigation, not a form submit), since every current CTA in
 *   the app is "go create/add something", not an inline mutation.
 */
export function EmptyState({ eyebrow, title, description, tone = 'neutral', compact = false, actions = [] }) {
  const classes = ['empty-state', compact && 'empty-state--compact', tone === 'positive' && 'empty-state--positive']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {eyebrow && <p className="eyebrow empty-state__eyebrow">{eyebrow}</p>}
      <p className="empty-state__title">{title}</p>
      {!compact && tone !== 'positive' && <TicketDivider />}
      {description && <p className="empty-state__description">{description}</p>}
      {actions.length > 0 && (
        <div className="empty-state__actions">
          {actions.map((action) => (
            <Link key={action.label} to={action.to} className={`btn btn--${action.variant || 'primary'}`}>
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
