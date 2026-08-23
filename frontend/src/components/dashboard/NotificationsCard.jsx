import { useEffect, useState } from 'react';
import * as notificationsApi from '../../api/notifications.js';
import { formatDateTime } from '../../utils/format.js';
import { EmptyState } from '../ui/EmptyState.jsx';
import { ErrorState } from '../ui/ErrorState.jsx';
import { isRetryableError } from '../../utils/errorPresentation.js';
import './DashboardCards.css';
import './NotificationsCard.css';

const PREVIEW_LIMIT = 5;

/**
 * A lightweight preview only - not the full notification center (that's a
 * later phase). Self-fetches from the existing GET /api/notifications
 * (scoped to this trip via ?tripId=), same read-only convention as
 * ApprovalRulesPanel/ExpenseVerificationPanel. Never calls
 * markRead/markAllRead - rendering a notification here has no side
 * effects, consistent with the backend's GET-is-a-read-not-an-action rule.
 */
export function NotificationsCard({ tripId }) {
  const [notifications, setNotifications] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadToken, setLoadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setNotifications(null);
    setLoadError(null);

    notificationsApi
      .listNotifications({ tripId })
      .then((data) => {
        if (!cancelled) setNotifications(data.slice(0, PREVIEW_LIMIT));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [tripId, loadToken]);

  return (
    <div className="card dashboard-card" aria-busy={notifications === null && !loadError ? 'true' : undefined}>
      <h2 className="dashboard-card__title">Notifications</h2>

      {loadError && (
        <ErrorState
          compact
          title="Couldn't load notifications."
          onRetry={isRetryableError(loadError) ? () => setLoadToken((t) => t + 1) : undefined}
        />
      )}

      {!loadError && notifications === null && (
        <span className="visually-hidden" role="status">
          Loading notifications…
        </span>
      )}

      {!loadError && notifications === null && (
        <ul className="dashboard-card__list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="notifications-card__item">
              <span className="skeleton skeleton--avatar" style={{ width: '8px', height: '8px', marginTop: '6px' }} />
              <div style={{ flex: 1 }} className="skeleton-stack">
                <span className="skeleton skeleton--text" style={{ width: `${80 - i * 15}%` }} />
                <span className="skeleton skeleton--text" style={{ width: '35%', height: '0.7em' }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loadError && notifications && notifications.length === 0 && (
        <EmptyState compact tone="positive" title="You're all caught up" description="No new notifications right now." />
      )}

      {!loadError && notifications && notifications.length > 0 && (
        <ul className="dashboard-card__list">
          {notifications.map((n) => (
            <li key={n.id} className="notifications-card__item">
              {!n.read_at && <span className="notifications-card__dot" aria-hidden="true" />}
              <div>
                <p className="notifications-card__message">{n.message}</p>
                <p className="notifications-card__time">{formatDateTime(n.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
