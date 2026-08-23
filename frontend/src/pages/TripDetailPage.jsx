import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import * as tripsApi from '../api/trips.js';
import * as dashboardApi from '../api/dashboard.js';
import { StatusBadge } from '../components/trips/StatusBadge.jsx';
import { ApprovalRulesPanel } from '../components/trips/ApprovalRulesPanel.jsx';
import { SettlementPanel } from '../components/settlement/SettlementPanel.jsx';
import { TripClosurePanel } from '../components/closure/TripClosurePanel.jsx';
import { BudgetSummaryCard } from '../components/dashboard/BudgetSummaryCard.jsx';
import { RecentExpensesCard } from '../components/dashboard/RecentExpensesCard.jsx';
import { PendingApprovalsCard } from '../components/dashboard/PendingApprovalsCard.jsx';
import { MembersCard } from '../components/dashboard/MembersCard.jsx';
import { NotificationsCard } from '../components/dashboard/NotificationsCard.jsx';
import { ActivityCard } from '../components/dashboard/ActivityCard.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { TicketDivider } from '../components/ui/TicketDivider.jsx';
import { humanizeErrorMessage, isRetryableError } from '../utils/errorPresentation.js';
import '../components/dashboard/DashboardCards.css';
import {
  formatBudgetType,
  formatDateRange,
  formatFairShareMethod,
  formatMoneyMinor,
  formatTripRole,
  formatVerificationMode,
} from '../utils/format.js';
import './TripDetailPage.css';

// Sections that belong to later phases. Shown as disabled navigation so
// the trip's future shape is visible now, without implementing any of that
// functionality yet. Dashboard/budget (9.5), expenses (9.3), expense
// approval/verification (9.4), and trip closure (9.7) are all live now, so
// nothing remains in this list - kept as an empty array (rather than
// deleted outright) so a future phase can reintroduce the same pattern
// without re-deriving it.
const UPCOMING_SECTIONS = [];

export function TripDetailPage() {
  const { tripId } = useParams();
  const { user, logout } = useAuth();

  const [detail, setDetail] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useDocumentTitle(detail ? `${detail.trip.name} \u00b7 Trip Ledger` : 'Trip \u00b7 Trip Ledger');

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDashboard(null);
    setError(null);

    // Two independent reads, run in parallel: getTripDetail supplies
    // settlementUnits/join_code (not in the dashboard payload), and the
    // dashboard endpoint supplies budget/recentExpenses/pendingApprovals
    // (not in getTripDetail). Neither is a duplicate of the other.
    Promise.all([tripsApi.getTripDetail(tripId), dashboardApi.getDashboard(tripId)])
      .then(([detailData, dashboardData]) => {
        if (!cancelled) {
          setDetail(detailData);
          setDashboard(dashboardData);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.code === 'UNAUTHENTICATED') {
          logout();
          return;
        }
        setError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [tripId, logout, reloadToken]);

  if (error) {
    const isNotFound = error.code === 'TRIP_NOT_FOUND';
    return (
      <div className="trip-detail-page__state">
        <ErrorState
          eyebrow={isNotFound ? 'TRIP NOT FOUND' : "COULDN'T LOAD TRIP"}
          title={isNotFound ? "This trip doesn't exist, or you're not a member of it." : humanizeErrorMessage(error)}
          onRetry={!isNotFound && isRetryableError(error) ? () => setReloadToken((t) => t + 1) : undefined}
          actions={[{ label: 'Back to my trips', to: '/', variant: 'secondary' }]}
        />
      </div>
    );
  }

  if (!detail || !dashboard) {
    return (
      <div className="trip-detail-page" aria-busy="true">
        <span className="visually-hidden" role="status">
          Loading trip…
        </span>
        <div className="trip-detail-page__header" aria-hidden="true">
          <span className="skeleton skeleton--title" style={{ width: '220px' }} />
          <span className="skeleton" style={{ width: '64px', height: '20px', borderRadius: '999px' }} />
        </div>
        <span className="skeleton skeleton--text" style={{ width: '160px', marginTop: 'var(--space-1)' }} aria-hidden="true" />

        <div className="card card--lg trip-detail-page__facts" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="trip-detail-page__fact skeleton-stack">
              <span className="skeleton skeleton--text" style={{ width: '50%', height: '0.7em' }} />
              <span className="skeleton skeleton--text" style={{ width: '75%' }} />
            </div>
          ))}
        </div>

        <div className="dashboard-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card dashboard-card">
              <span className="skeleton skeleton--text" style={{ width: '40%', height: '0.75em' }} />
              <div className="skeleton-stack">
                <span className="skeleton skeleton--text" style={{ width: '90%' }} />
                <span className="skeleton skeleton--text" style={{ width: '65%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { trip, members, settlementUnits } = detail;
  const myMembership = members.find((m) => m.user_id === user?.id);
  const canAddExpense = trip.status !== 'closed';

  return (
    <div className="trip-detail-page">
      <Link to="/" className="trip-detail-page__back-link">
        &larr; My Trips
      </Link>

      <div className="trip-detail-page__hero">
        <div className="trip-detail-page__heading">
          <div className="trip-detail-page__header">
            <h1 className="trip-detail-page__name">{trip.name}</h1>
            <StatusBadge status={trip.status} />
          </div>
          <p className="trip-detail-page__dates">{formatDateRange(trip.start_date, trip.end_date)}</p>
          {myMembership && (
            <span className={myMembership.role === 'owner' ? 'trip-detail-page__owner-tag' : 'trip-detail-page__role-tag'}>
              {myMembership.role === 'owner' ? 'You own this trip' : formatTripRole(myMembership.role)}
            </span>
          )}
        </div>

        {/* Phase 9.7: a closed trip no longer accepts new expenses -
            ExpenseService.createExpense rejects with 409
            TRIP_ALREADY_CLOSED, so this action is hidden rather than left
            to fail after navigation. */}
        {canAddExpense && (
          <Link to={`/trips/${trip.id}/expenses/new`} className="btn btn--primary trip-detail-page__primary-action">
            Add expense
          </Link>
        )}
      </div>

      {/* Presentation only, from the same trip.status already used for
          StatusBadge/canAddExpense above - no new data. Points down to
          Trip completion (TripClosurePanel) for the authoritative detail
          rather than duplicating its confirmation checklist/facts here. */}
      {trip.status === 'closed' && (
        <p className="trip-detail-page__completion-note trip-detail-page__completion-note--closed">
          This trip is complete and read-only. Expenses, approval rules, and settlement are locked in — see Trip
          completion below for the final settlement.
        </p>
      )}
      {trip.status === 'closing' && (
        <p className="trip-detail-page__completion-note">
          This trip is being finalized. See Trip completion below for what&rsquo;s still needed.
        </p>
      )}

      <div className="card card--lg trip-detail-page__summary">
        <div className="trip-detail-page__summary-budget">
          <span className="eyebrow trip-detail-page__summary-budget-label">Budget</span>
          <span className="trip-detail-page__summary-budget-value">
            {trip.budget_type === 'unlimited' ? 'Unlimited' : formatMoneyMinor(trip.budget_amount_minor, trip.currency)}
          </span>
          {trip.budget_type !== 'unlimited' && (
            <span className="trip-detail-page__summary-budget-caption">{formatBudgetType(trip.budget_type)}</span>
          )}
        </div>

        <TicketDivider />

        <div className="trip-detail-page__facts">
          <div className="trip-detail-page__fact">
            <span className="trip-detail-page__fact-label">Fair share</span>
            <span className="trip-detail-page__fact-value">{formatFairShareMethod(trip.fair_share_method)}</span>
          </div>
          <div className="trip-detail-page__fact">
            <span className="trip-detail-page__fact-label">Verification</span>
            <span className="trip-detail-page__fact-value">{formatVerificationMode(trip.verification_mode)}</span>
          </div>
          <div className="trip-detail-page__fact">
            <span className="trip-detail-page__fact-label">Members</span>
            <span className="trip-detail-page__fact-value">{members.length}</span>
          </div>
          <div className="trip-detail-page__fact">
            <span className="trip-detail-page__fact-label">Settlement units</span>
            <span className="trip-detail-page__fact-value">{settlementUnits.length}</span>
          </div>
          <div className="trip-detail-page__fact">
            <span className="trip-detail-page__fact-label">Join code</span>
            <span className="trip-detail-page__fact-value trip-detail-page__join-code mono">{trip.join_code}</span>
          </div>
        </div>
      </div>

      <div className="trip-detail-page__actions">
        <Link to={`/trips/${trip.id}/expenses`} className="btn btn--secondary">
          View expenses
        </Link>
        <Link to={`/trips/${trip.id}/members`} className="btn btn--secondary">
          View members &amp; settlement units
        </Link>
      </div>

      {trip.verification_mode === 'tiered' && (
        <ApprovalRulesPanel
          tripId={trip.id}
          currency={trip.currency}
          myRole={myMembership?.role}
          isTripClosed={trip.status === 'closed'}
        />
      )}

      <p className="eyebrow trip-detail-page__section-label">Overview</p>
      <div className="dashboard-grid">
        <BudgetSummaryCard budget={dashboard.budget} currency={trip.currency} />
        <PendingApprovalsCard tripId={trip.id} pendingApprovals={dashboard.pendingApprovals} currency={trip.currency} />
        <RecentExpensesCard tripId={trip.id} expenses={dashboard.recentExpenses} currency={trip.currency} tripStatus={trip.status} />
        <MembersCard tripId={trip.id} members={dashboard.members} />
        <NotificationsCard tripId={trip.id} />
        <ActivityCard tripId={trip.id} />
      </div>

      <SettlementPanel
        tripId={trip.id}
        currency={trip.currency}
        myMemberId={myMembership?.id}
        myRole={myMembership?.role}
        mySettlementUnitId={myMembership?.settlement_unit_id}
      />

      <TripClosurePanel
        tripId={trip.id}
        currency={trip.currency}
        myMemberId={myMembership?.id}
        members={members}
      />

      {UPCOMING_SECTIONS.length > 0 && (
        <div className="trip-detail-page__upcoming">
          <h2 className="trip-detail-page__upcoming-title">Coming next</h2>
          <ul className="trip-detail-page__upcoming-list">
            {UPCOMING_SECTIONS.map((section) => (
              <li key={section.label} className="trip-detail-page__upcoming-item">
                <span>{section.label}</span>
                <span className="trip-detail-page__upcoming-phase">Phase {section.phase}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
