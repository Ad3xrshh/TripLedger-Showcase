import { Link } from 'react-router-dom';
import { formatDateTime, formatMoneyMinor } from '../../utils/format.js';
import { EmptyState } from '../ui/EmptyState.jsx';
import './DashboardCards.css';
import './PendingApprovalsCard.css';

/**
 * DashboardService.getDashboard already resolves which pending expenses
 * the current member is eligible to approve
 * (expenseApprovalRepository.findPendingApprovalsForMember - excludes the
 * member's own expenses and anything they've already decided on). This
 * component only renders that list; it never re-derives eligibility.
 */
export function PendingApprovalsCard({ tripId, pendingApprovals, currency }) {
  return (
    <div className="card dashboard-card">
      <h2 className="dashboard-card__title">Pending approvals</h2>

      {pendingApprovals.length === 0 ? (
        <EmptyState compact tone="positive" title="You're all caught up" description="No expenses require your approval." />
      ) : (
        <ul className="dashboard-card__list">
          {pendingApprovals.map((e) => (
            <li key={e.expenseId}>
              <Link to={`/trips/${tripId}/expenses/${e.expenseId}`} className="pending-approval-row">
                <div className="pending-approval-row__main">
                  <span className="pending-approval-row__description">{e.description}</span>
                  <span className="pending-approval-row__meta">
                    {e.payer?.displayName ? `Paid by ${e.payer.displayName}` : 'Paid by \u2014'} · {formatDateTime(e.occurredAt)}
                  </span>
                </div>
                <span className="pending-approval-row__amount">{formatMoneyMinor(e.amountMinor, currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
