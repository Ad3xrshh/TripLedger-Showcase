import { Link } from 'react-router-dom';
import './DashboardCards.css';
import './MembersCard.css';


const VISIBLE_LIMIT = 6;

/**
 * Renders DashboardService's members.list as-is (memberId, role,
 * displayName, avatarUrl, settlementUnitId/Kind/Name, joinedAt) - no
 * internal IDs surfaced, no invented fields. Compacts to VISIBLE_LIMIT
 * names plus a "+N more" tag rather than growing the dashboard
 * indefinitely on large trips; full membership stays one click away via
 * the existing /trips/:tripId/members route.
 */
export function MembersCard({ tripId, members }) {
  const visible = members.list.slice(0, VISIBLE_LIMIT);
  const overflow = members.count - visible.length;

  return (
    <div className="card dashboard-card">
      <h2 className="dashboard-card__title">
        Members ({members.count})
        <Link to={`/trips/${tripId}/members`} className="dashboard-card__link">
          View all
        </Link>
      </h2>

      <ul className="members-card__list">
        {visible.map((m) => (
          <li key={m.memberId} className="members-card__item">
            <span className="members-card__avatar" aria-hidden="true">
              {m.displayName?.charAt(0).toUpperCase() || '?'}
            </span>
            <span className="members-card__name">{m.displayName}</span>
            {(m.role === 'owner' || m.role === 'admin') && (
              <span className="members-card__role-tag">{m.role === 'owner' ? 'Owner' : 'Admin'}</span>
            )}
          </li>
        ))}
      </ul>

      {overflow > 0 && <p className="members-card__overflow">+{overflow} more</p>}
    </div>
  );
}
