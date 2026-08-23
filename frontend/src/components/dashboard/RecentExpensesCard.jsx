import { Link } from 'react-router-dom';
import { ExpenseCard } from '../expenses/ExpenseCard.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import './DashboardCards.css';

/**
 * Reuses the real ExpenseCard/ExpenseStatus components rather than building
 * a second expense-row design. The dashboard endpoint already returns
 * recentExpenses newest-first, limited to 10 (see
 * DashboardService.RECENT_EXPENSES_LIMIT) - no re-sorting or re-slicing
 * happens here.
 *
 * DashboardService shapes each row as camelCase
 * (expenseId/amountMinor/occurredAt/payer.displayName), while ExpenseCard
 * was built for the raw snake_case list-endpoint shape
 * (id/amount_minor/occurred_at) - this is a pure field-name adapter, no
 * new rendering logic.
 */
export function RecentExpensesCard({ tripId, expenses, currency, tripStatus }) {
  return (
    <div className="card dashboard-card dashboard-grid__full">
      <h2 className="dashboard-card__title">
        Recent expenses
        <Link to={`/trips/${tripId}/expenses`} className="dashboard-card__link">
          View all
        </Link>
      </h2>

      {expenses.length === 0 ? (
        <EmptyState
          compact
          title="No expenses yet"
          description="Add your first expense to start tracking the trip."
          actions={tripStatus !== 'closed' ? [{ label: 'Add expense', to: `/trips/${tripId}/expenses/new` }] : []}
        />
      ) : (
        <div className="dashboard-card__recent-expenses">
          {expenses.map((e) => (
            <ExpenseCard
              key={e.expenseId}
              tripId={tripId}
              currency={currency}
              payerName={e.payer?.displayName}
              expense={{
                id: e.expenseId,
                description: e.description,
                amount_minor: e.amountMinor,
                category: e.category,
                occurred_at: e.occurredAt,
                status: e.status,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
