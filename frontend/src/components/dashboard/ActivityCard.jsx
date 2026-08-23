import { useEffect, useState } from 'react';
import * as historyApi from '../../api/history.js';
import { formatDateTime, formatHistoryAction } from '../../utils/format.js';
import { EmptyState } from '../ui/EmptyState.jsx';
import { ErrorState } from '../ui/ErrorState.jsx';
import { isRetryableError } from '../../utils/errorPresentation.js';
import './DashboardCards.css';
import './ActivityCard.css';

const PREVIEW_LIMIT = 8;

/**
 * A lightweight preview of GET /api/trips/:tripId/history - not a second
 * history system, not paginated here. HistoryService already returns
 * events newest-first (ORDER BY created_at DESC in
 * historyRepository.listHistoryForTrip); this just asks for the first
 * page at a small page size rather than fetching everything and slicing.
 */
export function ActivityCard({ tripId }) {
  const [events, setEvents] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadToken, setLoadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setLoadError(null);

    historyApi
      .getHistory(tripId, { page: 1, limit: PREVIEW_LIMIT })
      .then((data) => {
        if (!cancelled) setEvents(data.events);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [tripId, loadToken]);

  return (
    <div className="card dashboard-card" aria-busy={events === null && !loadError ? 'true' : undefined}>
      <h2 className="dashboard-card__title">Trip activity</h2>

      {loadError && (
        <ErrorState
          compact
          title="Couldn't load recent activity."
          onRetry={isRetryableError(loadError) ? () => setLoadToken((t) => t + 1) : undefined}
        />
      )}

      {!loadError && events === null && (
        <span className="visually-hidden" role="status">
          Loading recent activity…
        </span>
      )}

      {!loadError && events === null && (
        <ul className="dashboard-card__list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="activity-card__item">
              <span className="skeleton skeleton--text" style={{ width: `${70 - i * 10}%` }} />
              <span className="skeleton skeleton--text" style={{ width: '40%', height: '0.7em' }} />
            </li>
          ))}
        </ul>
      )}

      {!loadError && events && events.length === 0 && (
        <EmptyState compact title="No activity yet" description="Activity will appear here as members add expenses, approve transactions, and make changes." />
      )}

      {!loadError && events && events.length > 0 && (
        <ul className="dashboard-card__list">
          {events.map((e) => (
            <li key={e.id} className="activity-card__item">
              <span className="activity-card__action">{formatHistoryAction(e.action)}</span>
              <span className="activity-card__meta">
                {e.actor_display_name ? `${e.actor_display_name} · ` : ''}
                {formatDateTime(e.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
